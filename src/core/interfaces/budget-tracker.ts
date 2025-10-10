import type { Cost } from '../types'

/**
 * BudgetTracker enforces a finite control horizon by tracking cumulative cost.
 */
export interface BudgetTracker {
  /** Record cost for the current step (API call, token, time units, etc.). */
  record(cost: Cost): void
  /** Remaining budget (arbitrary units decided by adapter). */
  remaining(): number
  /** Whether budget is exhausted and the loop should stop. */
  shouldStop(): boolean
  /** Reset to an initial budget value (optional). */
  reset?(value?: Cost): void
}
