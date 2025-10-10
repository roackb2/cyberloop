import { Agent, run } from '@openai/agents'

import type { Planner } from '@/core/interfaces'

import type { GhState } from './env'
import type { GitHubSearchApi, SearchFilters } from './search-tool'

/**
 * GitHub Planner - Strategic planning using LLM
 * 
 * Responsibilities:
 * - plan(): Convert user query into initial SearchFilters
 * - evaluate(): Summarize found repositories
 * - replan(): Suggest alternative strategy when exploration fails
 */
export class GitHubPlanner implements Planner<GhState> {
  constructor(private readonly api: GitHubSearchApi) {}

  /**
   * Convert user's natural language query into initial search filters
   */
  async plan(userInput: string): Promise<GhState> {
    const agent = new Agent({
      name: 'GitHubPlannerAgent',
      instructions: `You are a GitHub search planner. Convert the user's query into structured search filters.

Extract:
- keywords: Main search terms (array of strings)
- language: Programming language if mentioned
- minStars: Minimum stars if quality is implied

Return JSON with this structure:
{
  "keywords": ["term1", "term2"],
  "language": "javascript",
  "minStars": 50
}

Be conservative - start with broad search that can be narrowed.`,
    })

    const result = await run(agent, userInput)
    let parsed: Partial<SearchFilters> = {}
    try {
      parsed = JSON.parse(result.finalOutput ?? '{}') as Partial<SearchFilters>
    } catch {
      // If parsing fails, use user input as keywords
    }

    // If LLM didn't provide keywords, split user input into words
    // Start with just the full phrase for broadest search
    const defaultKeywords = [userInput]
    
    const filters: SearchFilters = {
      keywords: parsed.keywords ?? defaultKeywords,
      language: parsed.language,
      minStars: parsed.minStars,
    }

    console.log(`[Planner] Created initial filters: ${JSON.stringify(filters)}`)

    return {
      query: filters.keywords.join(' '),
      filters,
      hits: 0,
      entropy: 0,
      history: [],
      probes: [],
    }
  }

  /**
   * Evaluate exploration results and create summary
   */
  async evaluate(state: GhState, history: GhState[]): Promise<string> {
    console.log(`[Planner] Evaluating results with ${state.hits} hits`)
    // Fetch fresh data from final state
    const results = await this.api.search(state.filters, { perPage: 10 })

    const agent = new Agent({
      name: 'GitHubEvaluatorAgent',
      instructions: `You are a GitHub research assistant. Analyze the repositories found and provide:

1. **Top Recommendations** - List 3-5 best repositories with:
   - Name and URL
   - Why it's relevant
   - How to use it

2. **Usage Guidance** - Practical next steps

3. **Gaps** - What wasn't found or needs further investigation

Format with markdown. Be specific and actionable.`,
    })

    const summary = {
      originalQuery: state.query,
      repositoriesFound: results.items?.slice(0, 10).map(item => ({
        name: item.title,
        url: item.url,
        stars: item.stars,
        description: item.labels?.[0] ?? '',
      })),
      totalHits: results.hits,
      explorationSteps: history.length,
    }

    const result = await run(agent, JSON.stringify(summary, null, 2))
    return result.finalOutput ?? 'No summary available'
  }

  /**
   * Suggest alternative search strategy when exploration fails
   */
  async replan(state: GhState, history: GhState[]): Promise<GhState | null> {
    console.log(`[Planner] Replanning after ${history.length} failed attempts`)
    const agent = new Agent({
      name: 'GitHubReplannerAgent',
      instructions: `You are a GitHub search strategist. The current search strategy failed to find good results.

Analyze the failed attempts and suggest a COMPLETELY DIFFERENT approach:
- Try different keywords
- Broaden or narrow scope
- Change language filter
- Adjust quality threshold

Return JSON with new search filters or null if you can't think of alternatives.`,
    })

    const context = {
      originalQuery: state.query,
      currentFilters: state.filters,
      attempts: history.map(h => ({
        filters: h.filters,
        hits: h.hits,
      })),
    }

    const result = await run(agent, JSON.stringify(context, null, 2))
    
    try {
      const parsed = JSON.parse(result.finalOutput ?? 'null') as Partial<SearchFilters> | null
      if (!parsed || !parsed.keywords) return null

      const filters: SearchFilters = {
        keywords: parsed.keywords,
        language: parsed.language,
        minStars: parsed.minStars,
      }

      return {
        query: filters.keywords.join(' '),
        filters,
        hits: 0,
        entropy: 0,
        history: [],
        probes: [],
      }
    } catch {
      return null
    }
  }
}
