import type { BudgetTracker } from '../interfaces';
import type { Middleware, StepContext, StepResult } from './types';

/**
 * Middleware that enforces a budget by delegating to an existing BudgetTracker.
 *
 * - `beforeStep`: halts if budget is exhausted, populates ctx.budget snapshot.
 * - `afterStep`: records the step cost (defaults to 1 if not specified).
 */
export function budgetMiddleware<S>(tracker: BudgetTracker): Middleware<S> {
  return {
    name: 'budget',

    beforeStep(ctx: StepContext<S>): Promise<StepContext<S> | 'halt'> {
      if (tracker.shouldStop()) {
        return Promise.resolve('halt');
      }
      const remaining = tracker.remaining();
      return Promise.resolve({
        ...ctx,
        budget: { used: ctx.step, remaining },
      });
    },

    afterStep(_ctx: StepContext<S>, result: StepResult<S>): Promise<void> {
      tracker.record(result.cost ?? 1);
      return Promise.resolve();
    },
  };
}
