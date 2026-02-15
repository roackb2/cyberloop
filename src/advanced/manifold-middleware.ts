import { decompose, distanceToCentroid, localPCA } from '../core/geometry/manifold';
import type { Logger } from '../core/interfaces';
import type { ManifoldProvider, ManifoldSnapshot, StateEmbedder } from '../core/kinematics/interfaces';
import { norm, subtract } from '../core/kinematics/math';
import type { VectorN } from '../core/kinematics/types';
import type { Middleware, StepContext, StepResult } from '../core/middleware/types';
import type { KinematicsSnapshot } from './kinematics-middleware';

export interface ManifoldMiddlewareOpts<S> {
  /** Embedder to convert state → vector. */
  embedder: StateEmbedder<S>;
  /** Corpus geometry provider (vector DB, embedding store, etc.). */
  manifold: ManifoldProvider;
  /** Number of neighbors for local PCA. Default: 50. */
  k?: number;
  /**
   * Number of principal components for tangent space.
   * If omitted, auto-selects to explain 80% of variance.
   */
  topK?: number;
  /**
   * Distance threshold for drift detection. When the nearest neighbor
   * distance exceeds this value, the agent is considered to be drifting
   * off the manifold (in a "data desert").
   *
   * If omitted, drift detection is disabled (isDrifting always false).
   */
  driftThreshold?: number;
  /**
   * Action to take when drift is detected.
   * - `'warn'` — annotate `isDrifting: true` in metadata, do not halt (default)
   * - `'halt'` — return `'halt'` to stop the control loop
   */
  driftAction?: 'warn' | 'halt';
  /** Optional logger for manifold telemetry. */
  logger?: Logger;
}

/**
 * Advanced middleware that performs Riemannian manifold analysis each step.
 *
 * It embeds the current state, queries the ManifoldProvider for k nearest
 * neighbors, runs local PCA to compute the tangent/normal decomposition,
 * and annotates `ctx.metadata['manifold']` with a `ManifoldSnapshot`.
 *
 * **Velocity source:** If `kinematicsMiddleware` is stacked before this
 * middleware, the EKF-filtered velocity from `metadata['kinematics']` is
 * used. Otherwise, raw velocity is computed as (current - previous embedding).
 *
 * The middleware **observes and annotates** by default. When `driftThreshold`
 * is set, it can also detect when the agent enters a "data desert" (no nearby
 * corpus data). The `driftAction` option controls whether this triggers a
 * halt or just a warning annotation in metadata.
 *
 * **Ordering:** Stack this middleware AFTER `kinematicsMiddleware` so that
 * the filtered velocity is available.
 */
export function manifoldMiddleware<S>(opts: ManifoldMiddlewareOpts<S>): Middleware<S> {
  const k = opts.k ?? 50;
  const driftAction = opts.driftAction ?? 'warn';

  let previousEmbedding: VectorN | null = null;

  return {
    name: 'manifold',

    setup(): Promise<void> {
      previousEmbedding = null;
      return Promise.resolve();
    },

    async beforeStep(ctx: StepContext<S>): Promise<StepContext<S>> {
      const observation = await opts.embedder.embed(ctx.state);

      // PERF: The k-NN query is likely the dominant cost in this middleware.
      // Future work: add caching if position hasn't moved significantly,
      // or accept a timeout option on ManifoldProvider.
      const neighbors = await opts.manifold.knn(observation, k);

      // Degenerate case: not enough neighbors for meaningful PCA
      if (neighbors.length < 2) {
        previousEmbedding = observation;
        return {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            manifold: buildDegenerateSnapshot(observation, neighbors.length),
          },
        };
      }

      // Run local PCA (Gramian dual trick — O(k³) not O(d³))
      const geometry = localPCA(neighbors, opts.topK);

      // Resolve velocity: prefer EKF-filtered from kinematics middleware
      const velocity = resolveVelocity(ctx, observation, previousEmbedding);

      // Decompose velocity into tangent (on-manifold) and normal (drift)
      const { tangent, normal } = geometry.tangentBasis.length > 0
        ? decompose(velocity, geometry.tangentBasis)
        : { tangent: velocity.map(() => 0), normal: velocity };

      // Compute distance to nearest neighbor
      const nearestDist = nearestNeighborDistance(observation, neighbors);

      // Determine if agent is drifting off manifold
      const isDrifting = opts.driftThreshold != null && nearestDist > opts.driftThreshold;

      const snapshot: ManifoldSnapshot = {
        velocityTangent: tangent,
        velocityNormal: normal,
        normalDriftMagnitude: norm(normal),
        curvature: geometry.curvature,
        explainedVariance: geometry.explainedVariance,
        distanceToCentroid: distanceToCentroid(observation, geometry.centroid),
        distanceToNearestNeighbor: nearestDist,
        neighborCount: neighbors.length,
        isDrifting,
      };

      previousEmbedding = observation;

      if (opts.logger) {
        opts.logger.info(
          {
            manifold: {
              step: ctx.step,
              curvature: parseFloat(geometry.curvature.toFixed(4)),
              explainedVariance: parseFloat(geometry.explainedVariance.toFixed(4)),
              normalDrift: parseFloat(snapshot.normalDriftMagnitude.toFixed(4)),
              nearestNeighbor: parseFloat(nearestDist.toFixed(4)),
              neighbors: neighbors.length,
              isDrifting,
            },
          },
          `[Manifold] Step ${ctx.step}: κ=${geometry.curvature.toFixed(4)}, Drift=${snapshot.normalDriftMagnitude.toFixed(4)}, NearestNeighbor=${nearestDist.toFixed(4)}, Drifting=${isDrifting}`,
        );
      }

      // Halt if drift detected and action is 'halt'
      if (isDrifting && driftAction === 'halt') {
        return 'halt' as unknown as StepContext<S>;
      }

      return {
        ...ctx,
        metadata: { ...ctx.metadata, manifold: snapshot },
      };
    },

    afterStep(_ctx: StepContext<S>, _result: StepResult<S>): Promise<void> {
      return Promise.resolve();
    },
  };
}

/**
 * Resolve the velocity vector for manifold decomposition.
 *
 * Prefers EKF-filtered velocity from kinematicsMiddleware (metadata['kinematics']).
 * Falls back to raw velocity (current - previous embedding) if kinematics
 * middleware is not present or this is the first step.
 */
function resolveVelocity<S>(
  ctx: StepContext<S>,
  currentEmbedding: VectorN,
  previousEmbedding: VectorN | null,
): VectorN {
  // Try to read EKF-filtered velocity from kinematics middleware
  const kinematicsData = ctx.metadata['kinematics'] as KinematicsSnapshot | undefined;
  if (kinematicsData?.velocity) {
    return kinematicsData.velocity;
  }

  // Fallback: raw velocity from consecutive embeddings
  if (previousEmbedding) {
    return subtract(currentEmbedding, previousEmbedding);
  }

  // First step: no velocity available
  return currentEmbedding.map(() => 0);
}

/**
 * Build a ManifoldSnapshot for degenerate cases (too few neighbors).
 */
function buildDegenerateSnapshot(observation: VectorN, neighborCount: number): ManifoldSnapshot {
  const d = observation.length;
  return {
    velocityTangent: new Array<number>(d).fill(0),
    velocityNormal: new Array<number>(d).fill(0),
    normalDriftMagnitude: 0,
    curvature: 1, // maximally uncertain
    explainedVariance: 0,
    distanceToCentroid: 0,
    distanceToNearestNeighbor: Infinity,
    neighborCount,
    isDrifting: true, // no neighbors = definitely drifting
  };
}

/**
 * Compute the Euclidean distance from a point to its nearest neighbor.
 */
function nearestNeighborDistance(point: VectorN, neighbors: VectorN[]): number {
  let minDist = Infinity;
  for (const neighbor of neighbors) {
    const d = norm(subtract(point, neighbor));
    if (d < minDist) minDist = d;
  }
  return minDist;
}
