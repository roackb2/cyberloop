import type { Logger } from '../interfaces';
import type { Middleware, StepContext, StepResult } from './types';

/**
 * Middleware that logs structured telemetry for each lifecycle event.
 *
 * - `setup`: logs loop start.
 * - `beforeStep`: logs step start with state and budget.
 * - `afterStep`: logs step end with action, cost, and feedback.
 * - `teardown`: logs loop end with reason.
 */
export function telemetryMiddleware<S>(logger: Logger): Middleware<S> {
  return {
    name: 'telemetry',

    setup(ctx: { input: string }): Promise<void> {
      logger.info({ input: ctx.input }, 'Loop started');
      return Promise.resolve();
    },

    beforeStep(ctx: StepContext<S>): Promise<StepContext<S>> {
      logger.debug(
        { step: ctx.step, budget: ctx.budget },
        `Step ${ctx.step} starting`,
      );
      return Promise.resolve(ctx);
    },

    afterStep(ctx: StepContext<S>, result: StepResult<S>): Promise<void> {
      logger.debug(
        {
          step: ctx.step,
          action: result.action,
          cost: result.cost,
          feedback: ctx.metadata['feedback'],
        },
        `Step ${ctx.step} completed`,
      );
      return Promise.resolve();
    },

    teardown(ctx: { reason: string }): Promise<void> {
      logger.info({ reason: ctx.reason }, 'Loop ended');
      return Promise.resolve();
    },
  };
}
