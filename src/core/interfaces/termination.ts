/**
 * TerminationPolicy decides when to stop exploration based on various signals.
 * 
 * NOTE: Currently not used in Inner/Outer Loop architecture.
 * ProbePolicy.isStable() and budget checks handle termination.
 * Kept for future scenarios with complex stopping criteria (e.g., multi-objective optimization).
 * See docs/implementation/unused-interfaces.md for details.
 */
export interface TerminationPolicy {
  shouldStop(input: {
    t: number
    budgetRemaining: number
    noImprovementSteps: number
    lastFeedback?: number
  }): { stop: boolean; reason?: string }
}
