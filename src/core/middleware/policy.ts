import type { Ladder, ProbePolicy } from '../interfaces'
import type { PolicyGuard, PolicyReflex } from '../policy/chain'
import { ChainPolicy } from '../policy/chain'
import type { Middleware, StepContext, StepResult } from './types'

/**
 * Options for creating a policy middleware.
 *
 * @typeParam S - State type
 * @typeParam A - Action type
 * @typeParam F - Feedback type
 */
export interface PolicyMiddlewareOpts<S, A, F> {
  /** Base policy that makes decisions when no reflex triggers */
  basePolicy: ProbePolicy<S, A, F>
  /** Guards that modify state before the base policy sees it (run in order) */
  guards?: PolicyGuard<S>[]
  /** Reflexes that can intercept and override the policy decision (checked first) */
  reflexes?: PolicyReflex<S, A>[]
  /** Ladder for exploration regulation */
  ladder: Ladder<F>
}

/**
 * Result of `policyMiddleware()` — provides both a middleware and a `decideAction`
 * function for use inside `SteppableAgent.step()`.
 *
 * ## Why two parts?
 *
 * Middleware operates at the step boundary (beforeStep/afterStep), but the policy
 * decision needs to happen WITHIN the step — the agent's `step(state)` must know
 * what action to take. Since `step()` only receives `state` (not the full
 * `StepContext` with metadata), the middleware can't pre-compute the action and
 * pass it through.
 *
 * Instead, `policyMiddleware()` returns:
 *   - `middleware`: handles initialization and logging at the step boundary
 *   - `decideAction(state)`: call this inside your `step()` to get the action
 *
 * ## Usage
 *
 * ```ts
 * const { middleware, decideAction } = policyMiddleware({
 *   basePolicy: new MyPolicy(),
 *   guards: [blacklistGuard, boredomGuard],
 *   reflexes: [lineOfSightReflex],
 *   ladder: new ProportionalLadder({ ... }),
 * })
 *
 * const agent: SteppableAgent<S, string, Result> = {
 *   async step(state) {
 *     const action = await decideAction(state)
 *     const nextState = await env.apply(action)
 *     return { state: nextState, action, cost: 1 }
 *   },
 *   // ...
 * }
 *
 * const wrapped = cyberloop(agent, {
 *   middleware: [middleware, telemetryMiddleware(logger)],
 * })
 * ```
 */
export function policyMiddleware<S, A, F>(
  opts: PolicyMiddlewareOpts<S, A, F>,
): { middleware: Middleware<S>; decideAction: (state: S) => Promise<A> } {
  const chain = new ChainPolicy<S, A, F>(
    opts.basePolicy,
    opts.guards ?? [],
    opts.reflexes ?? [],
  )

  let initialized = false
  let lastAction: A | undefined

  const decideAction = async (state: S): Promise<A> => {
    if (!initialized) {
      chain.initialize(state)
      initialized = true
    }
    const action = await chain.decide(state, opts.ladder)
    lastAction = action
    return action
  }

  const middleware: Middleware<S> = {
    name: `policy(${opts.basePolicy.id})`,

    setup() {
      initialized = false
      lastAction = undefined
      return Promise.resolve()
    },

    afterStep(ctx: StepContext<S>, result: StepResult<S>) {
      ctx.metadata['policyAction'] = lastAction

      // Feed back to ladder if feedback is available
      if (result.feedback !== undefined) {
        opts.ladder.update(result.feedback as F)
        opts.basePolicy.adapt?.(result.feedback as F, opts.ladder)
      }
      return Promise.resolve()
    },
  }

  return { middleware, decideAction }
}
