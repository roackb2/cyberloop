import type { Trajectory, TrajectoryFrame } from './trajectory';
export type { Trajectory, TrajectoryFrame } from './trajectory';
export { isTrajectory } from './trajectory';

/**
 * Minimal agent interface. Any object with a `run()` method qualifies.
 *
 * This is the only requirement for using `cyberloop()` in opaque mode —
 * CyberLoop wraps the entire `run()` call with middleware.
 */
export interface AgentLike<I = string, O extends AgentResult = AgentResult> {
  run(input: I): Promise<O>;
}

/**
 * Result returned by an agent's `run()` method.
 */
export interface AgentResult {
  output: string;
  [key: string]: unknown;
}

/**
 * An agent that exposes step-level control, enabling per-step middleware.
 *
 * `SteppableAgent` extends both `AgentLike` (for `run()`) and `Trajectory`
 * (for frame-by-frame control). The `step`/`isDone`/`toResult` methods are
 * the agent-specific names; they map to the generic `Trajectory` methods:
 *
 * | SteppableAgent | Trajectory   |
 * |----------------|--------------|
 * | `step()`       | `advance()`  |
 * | `isDone()`     | `isTerminal()` |
 * | `toResult()`   | `toOutput()` |
 * | `getInitialState()` | `getInitialState()` |
 *
 * When wrapped with `cyberloop()`, the wrapper drives the step loop:
 * ```
 * state = getInitialState(input)
 * while (!isDone(state)) {
 *   // middleware beforeStep
 *   stepOutput = step(state)
 *   // middleware afterStep
 *   state = stepOutput.state
 * }
 * return toResult(state)
 * ```
 */
export interface SteppableAgent<S = unknown, I = string, O extends AgentResult = AgentResult>
  extends AgentLike<I, O>, Trajectory<S> {
  /** Execute a single step from the current state. */
  step(state: S): Promise<StepOutput<S>>;
  /** Derive the initial state from the input. */
  getInitialState(input: I): Promise<S>;
  /** Check whether the agent has reached a terminal state. */
  isDone(state: S): boolean;
  /** Convert the final state into an AgentResult. */
  toResult(state: S): O;

  // --- Trajectory<S> implementation (maps to agent methods) ---

  /** Alias for `step()` — advances the trajectory by one frame. */
  advance(state: S): Promise<TrajectoryFrame<S>>;
  /** Alias for `isDone()` — checks if the trajectory is terminal. */
  isTerminal(state: S): boolean;
  /** Alias for `toResult()` — converts final state to output. */
  toOutput(state: S): O;
}

/**
 * Output of a single agent step.
 */
export interface StepOutput<S> {
  /** The new state after this step. */
  state: S;
  /** The action taken (for logging/middleware). */
  action?: unknown;
  /** Cost incurred by this step (for budget tracking). */
  cost?: number;
}

/**
 * Type guard: checks whether an agent implements SteppableAgent.
 */
export function isSteppable<S, I, O extends AgentResult>(
  agent: AgentLike<I, O>,
): agent is SteppableAgent<S, I, O> {
  return (
    'step' in agent &&
    'getInitialState' in agent &&
    'isDone' in agent &&
    'toResult' in agent
  );
}
