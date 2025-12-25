import { Agent, run } from '@openai/agents';

import type { Planner } from '../../core/interfaces';
import { fetchWikiPage } from './api';
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

    // Hydrate the initial state!
    logger.info(`[Planner] Hydrating initial state for: ${parsed.source}...`);
    const pageData = await fetchWikiPage(parsed.source);

    if (!pageData) {
      throw new Error(`[Planner] Could not fetch start page: ${parsed.source}`);
    }

    return {
      currentTitle: pageData.currentTitle ?? parsed.source,
      summary: pageData.summary ?? '',
      url: pageData.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(parsed.source)}`,
      goal: parsed.target,
      history: [],
      depth: 0,
      links: pageData.links ?? []
    };
  }

  async evaluate(state: WikiState, history: WikiState[]): Promise<string> {
    const path = history.map(h => h.currentTitle).join(' -> ');
    await Promise.resolve(); // Satisfy linter
    return `Navigation Complete.\nPath: ${path} -> ${state.currentTitle}\nGoal: ${state.goal}`;
  }

  async replan(state: WikiState, history: WikiState[]): Promise<WikiState | null> {
    logger.info('[Planner] ⚠️ Inner Loop exhausted. Initiating Strategic Retreat.');

    // 1. Check if we have history to retrace
    // If state.history is empty, we haven't moved from start, so we can't retreat.
    if (!state.history || state.history.length === 0) {
      logger.error('[Planner] No history to retrace. Cannot replan.');
      return null;
    }

    // 2. Strategy: Return to the Origin (Root Cause)
    // We use the full trajectory history to find the true start state.
    // history[0] is the initial state of the loop.
    const originalStart = history.length > 0 ? history[0].currentTitle : state.history[0];

    // 3. Inherit "Painful Memories" (Blacklist)
    // Preserve explored failures (blacklist) so Greedy Policy doesn't retry them.
    // Also blacklist the current dead-end (currentTitle).
    const newBlacklist = new Set(state.blacklist || []);
    newBlacklist.add(state.currentTitle);

    logger.info(`[Planner] 🔄 Teleporting back to start: "${originalStart}". Preserving ${newBlacklist.size} blacklisted items.`);

    // 4. Hydrate the initial state (ensure links are fresh)
    const pageData = await fetchWikiPage(originalStart);
    if (!pageData) return null;

    return {
      ...state,
      ...pageData, // Reset title, summary, links
      currentTitle: pageData.currentTitle!,
      history: [], // Clear history, clean slate
      depth: 0,    // Reset depth
      blacklist: Array.from(newBlacklist), // Keep the memory of failures
      candidateWeights: {}, // Reset weights (clear boredom)
      lastLinkClicked: undefined
    };
  }
}
