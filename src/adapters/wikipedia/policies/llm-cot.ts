import { type OpenAI } from 'openai';

import type { Ladder, ProbePolicy } from '../../../core/interfaces';
import { logger } from '../telemetry';
import type { WikiAction, WikiState } from '../types';

// const model = 'gpt-4o-mini';
const model = 'gpt-5.1';

interface CoTResponse {
  reasoning: string;
  selected_link: string;
}

export class LlmCoTPolicy implements ProbePolicy<WikiState, WikiAction, number> {
  public id = 'llm-cot-policy';
  private chatHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(
    private openai: OpenAI
  ) { }

  initialize(state: WikiState): void {
    logger.info(`[LlmCoTPolicy] Running with model: ${model}`);
    logger.info(`[LlmCoTPolicy] Initializing stateful agent. Goal: ${state.goal}`);
    this.chatHistory = [
      {
        role: 'system',
        content: `You are a strategic Wikipedia navigation agent.
Your goal is to reach the topic "${state.goal}" starting from "${state.currentTitle}".
You must strictly output JSON.
`
      }
    ];
  }

  isStable(state: WikiState): boolean {
    return state.currentTitle === state.goal;
  }

  async decide(state: WikiState, _ladder: Ladder<number>): Promise<WikiAction> {
    if (state.currentTitle === state.goal) {
      return { type: 'DONE', result: "Arrived at Goal!" };
    }

    if (!state.links || state.links.length === 0) {
      return { type: 'DONE', result: "Dead End" };
    }

    // Filter out meta-namespaces
    const basicValidLinks = state.links.filter(link =>
      !link.startsWith('Wikipedia:') &&
      !link.startsWith('Template:') &&
      !link.startsWith('Category:') &&
      !link.startsWith('Help:') &&
      !link.startsWith('Portal:') &&
      !link.startsWith('Talk:') &&
      !link.startsWith('Special:') &&
      !link.startsWith('File:')
    );

    // Limit to top 50 to fit context
    const candidates = basicValidLinks.slice(0, 50);

    logger.debug(`[LlmCoTPolicy] State: ${JSON.stringify(state)}`);

    const prompt = `
State:
${JSON.stringify(state)}

Available Links (Top 50):
${JSON.stringify(candidates)}

Your task:
1. Analyze the relationship between the current topic and the goal.
2. Evaluate the available links to see which one is semantically closest or most likely to lead to the goal.
3. Reason step-by-step about why you are choosing a specific link.
4. Output your decision in strict JSON format.

JSON Format:
{
  "reasoning": "your step-by-step reasoning here",
  "selected_link": "exact string from the available links list"
}
`;

    // Append user message
    this.chatHistory.push({ role: 'user', content: prompt });

    // Context Window Management: Keep System + Last 10 messages
    // If history grows beyond ~12 items (1 system + 11 others), truncate
    if (this.chatHistory.length > 12) {
      const system = this.chatHistory[0];
      const recent = this.chatHistory.slice(-10);
      this.chatHistory = [system, ...recent];
      logger.debug(`[LlmCoTPolicy] Truncated history to last 10 turns.`);
    }

    logger.info(`[LlmCoTPolicy] Thinking... (History Depth: ${this.chatHistory.length})`);

    try {
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: this.chatHistory,
        response_format: { type: 'json_object' },
        temperature: 0.2
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("Empty response from LLM");
      }

      logger.info(`[LlmCoTPolicy] LLM Response: ${content}`);

      // Append assistant response
      this.chatHistory.push({ role: 'assistant', content });

      const parsed = JSON.parse(content) as CoTResponse;
      const selectedLink = parsed.selected_link;

      if (!candidates.includes(selectedLink)) {
        logger.warn(`[LlmCoTPolicy] Hallucinated link: ${selectedLink}. Fallback to first candidate.`);
        return { type: 'NAVIGATE', title: candidates[0] };
      }

      logger.info(`[LlmCoTPolicy] Reasoning: ${parsed.reasoning}`);
      logger.info(`[LlmCoTPolicy] Selected: ${selectedLink}`);

      return { type: 'NAVIGATE', title: selectedLink };

    } catch (error) {
      logger.error(`[LlmCoTPolicy] Error: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback
      return { type: 'NAVIGATE', title: candidates[0] };
    }
  }
}
