import type { Feedback, State } from '../types'

/**
 * Evaluator measures progress / stability and emits a feedback signal.
 * It can be cheap (deterministic) or expensive (semantic), depending on the adapter.
 */
export interface Evaluator<S = State, F = Feedback> {
  /** Evaluate transition from prev -> next (and optionally action inside adapter) */
  evaluate(prev: S, next: S): F
}
