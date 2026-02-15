/**
 * Typed metadata channels shared across middleware within a single step.
 *
 * Each control layer writes to its own channel. The index signature
 * preserves backward compatibility — user middleware can still write
 * arbitrary keys.
 */
export interface MetadataChannels {
  /** v2.1 Semantic Kinematics snapshot (EKF/PID). */
  kinematics?: unknown;
  /** v2.1 Correction info when drift is detected. */
  kinematicsCorrection?: unknown;
  /** v3.0 Riemannian manifold snapshot (reserved). */
  manifold?: unknown;
  /** v4.0 Grassmannian subspace snapshot (reserved). */
  grassmannian?: unknown;
  /** Policy action taken by policyMiddleware. */
  policyAction?: unknown;
  /** Extensible — user middleware can write arbitrary keys. */
  [key: string]: unknown;
}

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
  /** Typed metadata shared across middleware in a single step */
  metadata: MetadataChannels;
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
  setup?(ctx: { input: unknown }): Promise<void>;

  /**
   * Called once when the loop ends (normal completion or halt).
   */
  teardown?(ctx: { reason: string }): Promise<void>;
}
