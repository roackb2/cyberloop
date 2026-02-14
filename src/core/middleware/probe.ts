import type { Probe } from '../interfaces';
import type { Middleware, StepContext } from './types';

/**
 * Middleware that runs a Probe before each step and attaches the result to metadata.
 *
 * - `beforeStep`: runs `probe.test(state)`, stores result in `ctx.metadata[probe.id]`.
 */
export function probeMiddleware<S>(probe: Probe<S>): Middleware<S> {
  return {
    name: `probe:${probe.id}`,

    async beforeStep(ctx: StepContext<S>): Promise<StepContext<S>> {
      const result = await probe.test(ctx.state);
      return {
        ...ctx,
        metadata: { ...ctx.metadata, [probe.id]: result },
      };
    },
  };
}
