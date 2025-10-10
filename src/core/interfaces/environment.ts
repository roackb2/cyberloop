import type { Action, State } from '../types'

/**
 * Environment provides observable state and executes actions.
 * It should be a thin, deterministic adapter to the external world or simulator.
 */
export interface Environment<S = State, A = Action> {
  /** Observe the current state snapshot. Should NOT have side effects. */
  observe(): Promise<S> | S
  /** Apply an action and return the next state. May be async. */
  apply(action: A): Promise<S>
}
