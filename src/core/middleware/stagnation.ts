import type { Middleware, StepContext, StepResult } from './types';

export interface StagnationOpts {
  /** Number of consecutive non-improving steps before halting. Default: 5 */
  maxStagnantSteps?: number;
  /** Minimum feedback value to count as improvement. Default: 0 */
  minImprovement?: number;
}

/**
 * Middleware that halts the loop when feedback stagnates.
 *
 * - `afterStep`: reads `ctx.metadata['feedback']` (typically set by evaluatorMiddleware).
 *   If feedback ≤ minImprovement, increments stagnation counter. Resets on improvement.
 * - `beforeStep`: halts if stagnation counter ≥ maxStagnantSteps.
 * - `setup`: resets counter.
 */
export function stagnationMiddleware<S>(opts: StagnationOpts = {}): Middleware<S> {
  const maxStagnant = opts.maxStagnantSteps ?? 5;
  const minImprovement = opts.minImprovement ?? 0;
  let stagnantCount = 0;

  return {
    name: 'stagnation',

    setup(): Promise<void> {
      stagnantCount = 0;
      return Promise.resolve();
    },

    beforeStep(ctx: StepContext<S>): Promise<StepContext<S> | 'halt'> {
      if (stagnantCount >= maxStagnant) {
        return Promise.resolve('halt');
      }
      return Promise.resolve(ctx);
    },

    afterStep(_ctx: StepContext<S>, _result: StepResult<S>): Promise<void> {
      const feedback = _ctx.metadata['feedback'];
      if (typeof feedback === 'number' && feedback > minImprovement) {
        stagnantCount = 0;
      } else {
        stagnantCount++;
      }
      return Promise.resolve();
    },
  };
}
