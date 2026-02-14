/**
 * Context passed to middleware before each agent step.
 */
export interface StepContext<S = unknown> {
  /** Current step number (0-indexed) */
  step: number;
  /** Current state */
  state: S;
  /** Previous state (undefined on first step) */
  prevState?: S;
  /** Budget snapshot */
  budget: { used: number; remaining: number };
  /** Arbitrary metadata shared across middleware in a single step */
  metadata: Record<string, unknown>;
}

/**
 * Result produced after an agent step.
 */
export interface StepResult<S = unknown> {
  /** State after the step */
  state: S;
  /** Action taken (if any) */
  action?: unknown;
  /** Feedback signal (if any) */
  feedback?: unknown;
  /** Cost incurred by this step */
  cost?: number;
}

/**
 * A composable unit of logic that hooks into the agent control loop.
 *
 * Middleware can intercept before/after each step, and participate in
 * setup/teardown lifecycle events. All hooks are optional — implement
 * only what you need.
 *
 * `beforeStep` runs in registration order.
 * `afterStep` runs in reverse registration order (Koa-style onion).
 */
export interface Middleware<S = unknown> {
  /** Human-readable name for logging/debugging */
  name: string;

  /**
   * Run before each agent step.
   * - Return a (possibly modified) `StepContext` to continue.
   * - Return `'halt'` to stop the loop immediately.
   */
  beforeStep?(ctx: StepContext<S>): Promise<StepContext<S> | 'halt'>;

  /**
   * Run after each agent step.
   * Receives the context and the step result.
   */
  afterStep?(ctx: StepContext<S>, result: StepResult<S>): Promise<void>;

  /**
   * Called once when the loop starts, before the first step.
   */
  setup?(ctx: { input: string }): Promise<void>;

  /**
   * Called once when the loop ends (normal completion or halt).
   */
  teardown?(ctx: { reason: string }): Promise<void>;
}
