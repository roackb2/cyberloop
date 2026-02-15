/**
 * A generic control subject that produces a sequence of semantic states.
 *
 * `Trajectory<S>` is the foundational abstraction for CyberLoop's control loop.
 * Any process that can be modeled as a sequence of states — agent reasoning,
 * document scanning, narrative evaluation, corpus analysis — can implement
 * this interface and be wrapped with `cyberloop()`.
 *
 * `SteppableAgent` extends this interface, so existing agent code continues
 * to work unchanged.
 *
 * @typeParam S - The state type carried through the trajectory.
 *
 * @example
 * ```ts
 * // A corpus scanner as a Trajectory
 * const scanner: Trajectory<ChunkState> = {
 *   getInitialState: (corpus) => loadFirstChunk(corpus),
 *   advance: (state) => embedAndScoreNextChunk(state),
 *   isTerminal: (state) => state.chunkIndex >= state.totalChunks,
 *   toOutput: (state) => state.manifoldReport,
 * };
 *
 * const controlled = cyberloop(scanner, {
 *   middleware: [manifoldMiddleware({ corpus: companyDocs })],
 * });
 * ```
 */
export interface Trajectory<S> {
  /** Derive the initial state from the input. */
  getInitialState(input: unknown): Promise<S>;
  /** Advance the trajectory by one frame from the current state. */
  advance(state: S): Promise<TrajectoryFrame<S>>;
  /** Check whether the trajectory has reached a terminal state. */
  isTerminal(state: S): boolean;
  /** Convert the final state into an output value. */
  toOutput(state: S): unknown;
}

/**
 * A single frame in a trajectory — the result of one `advance()` call.
 */
export interface TrajectoryFrame<S> {
  /** The new state after this frame. */
  state: S;
  /** The action taken (for logging/middleware). */
  action?: unknown;
  /** Cost incurred by this frame (for budget tracking). */
  cost?: number;
}

/**
 * Type guard: checks whether a value implements the Trajectory interface.
 */
export function isTrajectory<S>(value: unknown): value is Trajectory<S> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getInitialState' in value &&
    'advance' in value &&
    'isTerminal' in value &&
    'toOutput' in value
  );
}
