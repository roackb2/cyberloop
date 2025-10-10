import type { Action, Feedback, State } from '../types'
import type { Ladder } from './ladder'

/**
 * Policy decides the next action and can adapt from feedback & ladder signals.
 */
export interface Policy<S = State, A = Action, F = Feedback> {
  id: string
  /** Declarative metadata used by StrategySelector for routing. */
  capabilities?(): {
    handles?: string[]            // e.g., failure types it handles well
    explorationRange?: [number, number] // ladder window where it's most effective
    cost?: { step: number; expected?: number }
  }
  /** Decide the next action given the current state & ladder level. */
  decide(state: S, ladder: Ladder<F>): Promise<A> | A
  /** Optional adaptation hook with latest feedback. */
  adapt?(feedback: F, ladder: Ladder<F>): void
}

/**
 * ProbePolicy - Fast, reflexive control policy for inner loop
 * 
 * Part of the inner control loop. Makes deterministic decisions based on
 * probe signals (gradient information) without expensive LLM calls.
 * 
 * Inspired by AICL whitepaper: "Probe performs low-cost checks to confirm direction"
 * 
 * @template S - State type
 * @template A - Action type
 * @template F - Feedback type (typically number for gradient)
 */
export interface ProbePolicy<S = State, A = Action, F = Feedback> extends Policy<S, A, F> {
  /**
   * Initialize policy with the initial state from planner
   * Called once at the start of exploration
   */
  initialize(state: S): void

  /**
   * Check if current state is stable/good enough to stop exploration
   * Returns true when state is in acceptable range
   */
  isStable(state: S): boolean
}
