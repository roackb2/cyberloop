import type { Evaluator } from '../interfaces';
import type { Middleware, StepContext, StepResult } from './types';

/**
 * Middleware that computes feedback after each step using an Evaluator.
 *
 * - `afterStep`: if `prevState` exists, calls `evaluator.evaluate(prev, next)`
 *   and stores the feedback in `ctx.metadata['feedback']`.
 */
export function evaluatorMiddleware<S>(evaluator: Evaluator<S>): Middleware<S> {
  return {
    name: 'evaluator',

    async afterStep(ctx: StepContext<S>, result: StepResult<S>): Promise<void> {
      if (ctx.prevState !== undefined) {
        const feedback = await evaluator.evaluate(ctx.prevState, result.state);
        ctx.metadata['feedback'] = feedback;
      }
    },
  };
}
