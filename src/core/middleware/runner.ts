import type { Middleware, StepContext, StepResult } from './types';

/**
 * Executes a chain of middleware around agent steps.
 *
 * - `beforeStep` hooks run in registration order (first registered → first to run).
 * - `afterStep` hooks run in reverse order (Koa-style onion model).
 * - `setup` and `teardown` run in registration order.
 *
 * If any `beforeStep` returns `'halt'`, the step is skipped and the loop should stop.
 */
export class MiddlewareRunner<S = unknown> {
  private readonly stack: Middleware<S>[];

  constructor(middleware: Middleware<S>[] = []) {
    this.stack = [...middleware];
  }

  /** Add a middleware to the end of the chain. */
  use(mw: Middleware<S>): void {
    this.stack.push(mw);
  }

  /** Number of middleware in the chain. */
  get size(): number {
    return this.stack.length;
  }

  /**
   * Run all `setup` hooks in registration order.
   */
  async runSetup(ctx: { input: unknown }): Promise<void> {
    for (const mw of this.stack) {
      if (mw.setup) {
        await mw.setup(ctx);
      }
    }
  }

  /**
   * Run all `teardown` hooks in registration order.
   */
  async runTeardown(ctx: { reason: string }): Promise<void> {
    for (const mw of this.stack) {
      if (mw.teardown) {
        await mw.teardown(ctx);
      }
    }
  }

  /**
   * Run all `beforeStep` hooks in registration order.
   *
   * Each middleware receives the (possibly modified) context from the previous one.
   * If any middleware returns `'halt'`, execution stops immediately and `'halt'` is returned.
   *
   * @returns The final `StepContext` to pass to the agent, or `'halt'` to stop the loop.
   */
  async runBeforeStep(ctx: StepContext<S>): Promise<StepContext<S> | 'halt'> {
    let current: StepContext<S> = ctx;

    for (const mw of this.stack) {
      if (mw.beforeStep) {
        const result = await mw.beforeStep(current);
        if (result === 'halt') {
          return 'halt';
        }
        current = result;
      }
    }

    return current;
  }

  /**
   * Run all `afterStep` hooks in reverse registration order (onion model).
   */
  async runAfterStep(ctx: StepContext<S>, result: StepResult<S>): Promise<void> {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const mw = this.stack[i];
      if (mw.afterStep) {
        await mw.afterStep(ctx, result);
      }
    }
  }
}
