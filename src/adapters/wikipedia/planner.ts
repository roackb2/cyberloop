import { Agent, run } from '@openai/agents';

import type { Planner } from '../../core/interfaces';
import { logger } from './telemetry';
import type { WikiState } from './types';

interface ParsedPlan {
  source: string;
  target: string;
}

export class WikipediaPlanner implements Planner<WikiState> {
  async plan(input: string): Promise<WikiState> {
    logger.info(`[Planner] Planning trajectory for: "${input}"`);

    // Simple heuristic: "Start -> End" or "Start to End"
    // Use LLM to robustly parse
    const agent = new Agent({
      name: 'WikiPlannerAgent',
      instructions: `You are a Wikipedia navigation planner.
Parse the user input to extract the "Source" topic and the "Target" topic.
Input format is typically "Source -> Target" or "From Source to Target".

Return JSON:
{
  "source": "Exact Wikipedia Title",
  "target": "Exact Wikipedia Title"
}
`
    });

    const result = await run(agent, input);
    let parsed: ParsedPlan = { source: 'Jacquard machine', target: 'Central processing unit' }; // Defaults
    try {
      if (result.finalOutput) {
        parsed = JSON.parse(result.finalOutput) as ParsedPlan;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[Planner] Failed to parse plan, using defaults. Error: ${msg}`);
    }

    logger.info({ parsed }, '[Planner] Parsed route');

    return {
      currentTitle: parsed.source,
      summary: '', // Will be filled by Env on first observe/fetch
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(parsed.source)}`,
      goal: parsed.target,
      history: [],
      depth: 0,
      links: []
    };
  }

  async evaluate(state: WikiState, history: WikiState[]): Promise<string> {
    const path = history.map(h => h.currentTitle).join(' -> ');
    await Promise.resolve(); // Satisfy linter
    return `Navigation Complete.\nPath: ${path} -> ${state.currentTitle}\nGoal: ${state.goal}`;
  }

  async replan(_state: WikiState, _history: WikiState[]): Promise<WikiState | null> {
    logger.info('[Planner] Replanning...');
    // In a real agent, we might change the goal or restart
    // For now, we return null to stop (or maybe backstep?)
    await Promise.resolve(); // Satisfy linter
    return null;
  }
}
