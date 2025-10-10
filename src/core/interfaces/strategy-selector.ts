import type { FailureType, Signal } from '../types'
import type { Policy } from './policy'
import type { Probe } from './probe'

/**
 * StrategySelector is the meta-controller that routes between probes and policies
 * based on failure categories, ladder level, and remaining budget.
 */
export interface StrategySelector<S = unknown, A = unknown> {
  select(input: {
    failure: FailureType
    ladderLevel: number
    budgetRemaining: number
    probes: Probe<S>[]
    policies: Policy<S, A>[]
    context?: Signal
  }): { probe: Probe<S>; policy: Policy<S, A> }
}
