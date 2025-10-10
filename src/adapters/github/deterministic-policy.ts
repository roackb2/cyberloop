import type { Ladder, ProbePolicy } from '@/core/interfaces'

import type { GhAction, GhState } from './env'
import type { SearchFilters } from './search-tool'

/**
 * Deterministic search policy that adjusts search dimensions without agent calls.
 *
 * Strategy:
 * - Too many hits (>100): Narrow by adding constraints
 * - Too few hits (<5): Broaden by removing constraints
 * - Good range (5-100): Stop and return to planner
 *
 * Narrowing priority:
 * 1. Add language filter (if not set)
 * 2. Increase minStars threshold
 * 3. Add more keywords from initial set
 * 4. Enable in_name filter
 *
 * Broadening priority:
 * 1. Remove minStars filter
 * 2. Remove last keyword (keep at least 1)
 * 3. Add OR keywords
 * 4. Remove language filter
 */
export class DeterministicSearchPolicy implements ProbePolicy<GhState, GhAction, number> {
  readonly id = 'deterministic-search-policy'
  private initialKeywords: string[] = []
  private initialized = false
  private narrowAttempts = 0 // Track how many times we've narrowed

  capabilities() {
    return {
      explorationRange: [0, 3] as [number, number],
      cost: { step: 0.1 }, // Cheap - no agent calls
      handles: ['Unknown', 'TooBroad', 'TooNarrow', 'NoData'],
    }
  }

  /**
   * Initialize with state from planner's initial suggestion
   */
  initialize(state: GhState): void {
    this.initialKeywords = [...state.filters.keywords]
    this.initialized = true
  }

  /**
   * Check if current state is stable (good enough to stop exploration)
   * 
   * Stable range: 10-30 hits
   * - Too few (<10): Not enough results to be useful
   * - Good range (10-30): Perfect for detailed exploration
   * - Too many (>30): Need to narrow down
   */
  isStable(state: GhState): boolean {
    return state.hits >= 10 && state.hits <= 30
  }

  async decide(state: GhState, _ladder: Ladder<number>): Promise<GhAction> {
    if (!this.initialized) {
      throw new Error('DeterministicSearchPolicy must be initialized with initial keywords')
    }

    const { hits, filters } = state

    // Good range - signal success (orchestrator should stop and call agent)
    if (hits >= 10 && hits <= 30) {
      return { type: 'rephrase', payload: {} } // No-op, signals completion
    }

    // Too many hits - narrow down
    if (hits > 30) {
      return this.narrow(filters)
    }

    // Too few hits - broaden
    if (hits < 10) {
      return this.broaden(filters)
    }

    // Fallback (should never reach here if isStable is correct)
    return { type: 'rephrase', payload: {} }
  }

  private narrow(filters: SearchFilters): GhAction {
    this.narrowAttempts++
    
    // Strategy 1: Increase minStars threshold to filter for quality
    // Use smaller increments on subsequent attempts to avoid overshooting
    if (!filters.minStars || filters.minStars < 100) {
      const increment = this.narrowAttempts === 1 ? 50 : 20 // Smaller increment after first attempt
      const newMinStars = (filters.minStars ?? 0) + increment
      console.log(`[Policy] Narrowing (attempt ${this.narrowAttempts}): increasing minStars to ${newMinStars}`)
      return { type: 'narrow', payload: { exact: [`stars:>${newMinStars}`] } }
    }

    // Strategy 2: If minStars is already high, we can't narrow further with current tools
    console.log('[Policy] Cannot narrow further (minStars already at 100+)')
    return { type: 'rephrase', payload: {} }
  }

  private broaden(filters: SearchFilters): GhAction {
    // Strategy 1: If we have minStars filter, remove it first
    if (filters.minStars && filters.minStars > 0) {
      console.log('[Policy] Broadening: removing minStars filter')
      return { type: 'broaden', payload: { synonyms: ['stars:>0'] } } // Signal to remove minStars
    }

    // Strategy 2: Remove last keyword (keep at least 1)
    if (filters.keywords.length > 1) {
      console.log('[Policy] Broadening: removing last keyword')
      return { type: 'broaden', payload: {} }
    }

    // Strategy 3: Add OR keywords as alternatives
    if (!filters.orKeywords || filters.orKeywords.length === 0) {
      const alternatives = this.generateAlternatives(filters.keywords[0])
      if (alternatives.length > 0) {
        console.log('[Policy] Broadening: adding OR keywords')
        return { type: 'broaden', payload: { synonyms: alternatives } }
      }
    }

    // Can't broaden further - no-op
    console.log('[Policy] Cannot broaden further')
    return { type: 'rephrase', payload: {} }
  }

  private canInferLanguage(keywords: string[]): boolean {
    const languageKeywords = ['node', 'python', 'rust', 'go', 'java', 'javascript', 'typescript']
    return keywords.some(k => languageKeywords.includes(k.toLowerCase()))
  }

  private inferLanguage(keywords: string[]): string {
    const languageMap: Record<string, string> = {
      'node': 'javascript',
      'javascript': 'javascript',
      'typescript': 'typescript',
      'python': 'python',
      'rust': 'rust',
      'go': 'go',
      'java': 'java',
    }

    for (const keyword of keywords) {
      const lang = languageMap[keyword.toLowerCase()]
      if (lang) return lang
    }

    return 'javascript' // Default
  }

  private generateAlternatives(keyword: string): string[] {
    // Simple synonym generation (could be enhanced with LLM)
    const synonyms: Record<string, string[]> = {
      'graceful': ['smooth', 'clean'],
      'shutdown': ['stop', 'terminate', 'exit'],
      'node': ['nodejs', 'node.js'],
      'server': ['http', 'service'],
    }

    return synonyms[keyword.toLowerCase()] ?? []
  }

  adapt(_feedback: number, _ladder: Ladder<number>): void {
    // Deterministic policy doesn't adapt based on feedback
    // Adaptation happens through probe signals
  }
}
