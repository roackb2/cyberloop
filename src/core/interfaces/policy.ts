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
