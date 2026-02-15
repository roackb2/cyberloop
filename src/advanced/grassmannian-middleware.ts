import { compareSubspaces, extractSubspace, logMap } from '../core/geometry/grassmannian';
import type { Logger } from '../core/interfaces';
import type { GrassmannianSnapshot, StateEmbedder, SubspaceTrajectory } from '../core/kinematics/interfaces';
import type { VectorN } from '../core/kinematics/types';
import type { Middleware, StepContext, StepResult } from '../core/middleware/types';

export interface GrassmannianMiddlewareOpts<S> {
  /** Embedder to convert state → vector. Same as kinematicsMiddleware. */
  embedder: StateEmbedder<S>;
  /**
   * Number of recent embeddings to keep in the sliding window.
   * The subspace is extracted from this window each step.
   * Larger windows = more stable subspace, slower to react.
   * Smaller windows = more responsive, noisier.
   * Default: 10.
   */
  windowSize?: number;
  /**
   * Number of principal components (subspace dimension k).
   * If omitted, auto-selects to explain ≥ 80% of variance.
   */
  subspaceDim?: number;
  /**
   * Optional reference trajectory for comparison.
   * If provided, the middleware compares the current subspace to
   * `trajectory.referenceAt(ctx.step)` each step and computes
   * geodesic distance, principal angles, and steering direction.
   *
   * If omitted, the middleware only extracts and reports the current
   * subspace (no comparison, no drift detection).
   */
  trajectory?: SubspaceTrajectory;
  /**
   * Geodesic distance threshold for drift detection.
   * When the distance to the reference subspace exceeds this value,
   * `isDrifting` is set to true.
   *
   * Only meaningful when `trajectory` is provided.
   * If omitted, drift detection is disabled (isDrifting always false).
   */
  driftThreshold?: number;
  /**
   * Action to take when drift is detected.
   * - `'warn'` — annotate `isDrifting: true` in metadata, do not halt (default)
   * - `'halt'` — return `'halt'` to stop the control loop
   */
  driftAction?: 'warn' | 'halt';
  /**
   * Whether to compute the log map (steering direction) when a reference
   * trajectory is provided. The log map gives the tangent vector pointing
   * from the current subspace toward the reference.
   *
   * Default: true (when trajectory is provided).
   * Set to false to save computation if you only need distance/angles.
   */
  computeSteering?: boolean;
  /** Optional logger for Grassmannian telemetry. */
  logger?: Logger;
}

/**
 * Advanced middleware that performs Grassmannian subspace tracking each step.
 *
 * It embeds the current state, maintains a sliding window of recent embeddings,
 * extracts a subspace via SVD, and optionally compares it to a reference
 * trajectory on the Grassmannian manifold.
 *
 * Writes `ctx.metadata['grassmannian']` with a `GrassmannianSnapshot` containing:
 * - Current subspace basis and extraction quality
 * - Principal angles and geodesic distance to reference (if trajectory provided)
 * - Steering direction via log map (if enabled)
 * - Drift detection (if threshold configured)
 *
 * **Ordering:** Can be stacked independently of `kinematicsMiddleware` and
 * `manifoldMiddleware`. They observe different things and write to different
 * metadata channels.
 */
export function grassmannianMiddleware<S>(opts: GrassmannianMiddlewareOpts<S>): Middleware<S> {
  const windowSize = opts.windowSize ?? 10;
  const driftAction = opts.driftAction ?? 'warn';
  const computeSteering = opts.computeSteering ?? true;

  let window: VectorN[] = [];

  return {
    name: 'grassmannian',

    setup(): Promise<void> {
      window = [];
      return Promise.resolve();
    },

    async beforeStep(ctx: StepContext<S>): Promise<StepContext<S> | 'halt'> {
      const observation = await opts.embedder.embed(ctx.state);

      // Maintain sliding window (FIFO)
      window.push(observation);
      if (window.length > windowSize) {
        window = window.slice(window.length - windowSize);
      }

      // Need at least 2 vectors to extract a subspace
      if (window.length < 2) {
        return {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            grassmannian: buildDegenerateSnapshot(observation.length),
          },
        };
      }

      // Extract subspace from sliding window via SVD
      const extraction = extractSubspace(window, opts.subspaceDim);

      if (!extraction || extraction.basis.length === 0) {
        return {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            grassmannian: buildDegenerateSnapshot(observation.length),
          },
        };
      }

      // Compare to reference trajectory if provided
      let comparison = {
        principalAngles: [] as number[],
        geodesicDistance: 0,
        meanAngle: 0,
        maxAngle: 0,
      };
      let steering: VectorN[] | null = null;
      let isDrifting = false;

      if (opts.trajectory) {
        const referenceBasis = opts.trajectory.referenceAt(ctx.step);

        if (referenceBasis.length > 0) {
          comparison = compareSubspaces(extraction.basis, referenceBasis);

          // Compute steering direction (log map)
          if (computeSteering) {
            steering = logMap(extraction.basis, referenceBasis);
          }

          // Drift detection
          if (opts.driftThreshold != null) {
            isDrifting = comparison.geodesicDistance > opts.driftThreshold;
          }
        }
      }

      const snapshot: GrassmannianSnapshot = {
        currentBasis: extraction.basis,
        principalAngles: comparison.principalAngles,
        geodesicDistance: comparison.geodesicDistance,
        meanAngle: comparison.meanAngle,
        maxAngle: comparison.maxAngle,
        explainedVariance: extraction.explainedVariance,
        windowSize: window.length,
        subspaceDim: extraction.subspaceDim,
        isDrifting,
        steeringDirection: steering,
      };

      if (opts.logger) {
        opts.logger.info(
          {
            grassmannian: {
              step: ctx.step,
              geodesicDistance: parseFloat(comparison.geodesicDistance.toFixed(4)),
              meanAngle: parseFloat(comparison.meanAngle.toFixed(4)),
              maxAngle: parseFloat(comparison.maxAngle.toFixed(4)),
              explainedVariance: parseFloat(extraction.explainedVariance.toFixed(4)),
              windowSize: window.length,
              subspaceDim: extraction.subspaceDim,
              isDrifting,
            },
          },
          `[Grassmannian] Step ${ctx.step}: d_Gr=${comparison.geodesicDistance.toFixed(4)}, meanθ=${comparison.meanAngle.toFixed(4)}, maxθ=${comparison.maxAngle.toFixed(4)}, k=${extraction.subspaceDim}, Drifting=${isDrifting}`,
        );
      }

      // Halt if drift detected and action is 'halt'
      if (isDrifting && driftAction === 'halt') {
        return 'halt';
      }

      return {
        ...ctx,
        metadata: { ...ctx.metadata, grassmannian: snapshot },
      };
    },

    afterStep(_ctx: StepContext<S>, _result: StepResult<S>): Promise<void> {
      return Promise.resolve();
    },
  };
}

/**
 * Build a GrassmannianSnapshot for degenerate cases (not enough vectors in window).
 */
function buildDegenerateSnapshot(ambientDim: number): GrassmannianSnapshot {
  return {
    currentBasis: [],
    principalAngles: [],
    geodesicDistance: 0,
    meanAngle: 0,
    maxAngle: 0,
    explainedVariance: 0,
    windowSize: ambientDim > 0 ? 1 : 0,
    subspaceDim: 0,
    isDrifting: false,
    steeringDirection: null,
  };
}
