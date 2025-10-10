import type { Environment, Evaluator, Ladder, Policy } from './interfaces'
import { withRetry } from './utils/retry'

export interface ControlLoopResult<S, A, F> {
  state: S
  action: A
  next: S
  feedback: F
}

export interface ControlLoopOptions<S> {
  /** Use pre-observed state (avoids re-observing when probes already sampled it). */
  state?: S
  retry?: {
    observe?: number
    decide?: number
    apply?: number
    evaluate?: number
  }
}

/**
 * Pure control kernel: observe state, decide action, execute, and update feedback regulators.
 */
export async function controlLoop<S, A, F>(
  env: Environment<S, A>,
  evaluator: Evaluator<S, F>,
  policy: Policy<S, A, F>,
  ladder: Ladder<F>,
  options: ControlLoopOptions<S> = {},
): Promise<ControlLoopResult<S, A, F>> {
  const retry = options.retry ?? {}
  const state =
    options.state ??
    (await withRetry(() => env.observe(), retry.observe ?? 0))
  const action = await withRetry(
    () => policy.decide(state, ladder),
    retry.decide ?? 0,
  )
  const next = await withRetry(
    () => env.apply(action),
    retry.apply ?? 0,
  )
  const feedback = await withRetry(
    () => evaluator.evaluate(state, next),
    retry.evaluate ?? 0,
  )

  policy.adapt?.(feedback, ladder)
  ladder.update(feedback)

  return { state, action, next, feedback }
}
