export interface TerminationPolicy {
  shouldStop(input: {
    t: number
    budgetRemaining: number
    noImprovementSteps: number
    lastFeedback?: number
  }): { stop: boolean; reason?: string }
}
