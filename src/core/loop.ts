import type { Environment, Evaluator, Ladder, Policy } from './interfaces'

export interface ControlLoopResult<S, A, F> {
  state: S
  action: A
  next: S
  feedback: F
}

export interface ControlLoopOptions<S> {
  /** Use pre-observed state (avoids re-observing when probes already sampled it). */
  state?: S
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
  const state = options.state ?? (await env.observe())
  const action = await policy.decide(state, ladder)
  const next = await env.apply(action)
  const feedback = await evaluator.evaluate(state, next)

  policy.adapt?.(feedback, ladder)
  ladder.update(feedback)

  return { state, action, next, feedback }
}
