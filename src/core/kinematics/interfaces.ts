import type { SubspaceBasis } from '../geometry/grassmannian';
import type { State } from '../types';
import type { VectorN } from './types';

// Adapters must implement this to translate their Domain State (JSON) into Physics State (Vector)
// This allows the user to define any embedding strategy (OpenAI, local BERT, random projection, etc.)
export interface StateEmbedder<S extends State> {
  embed(state: S): Promise<VectorN>;
}

// v3.0: Provides access to corpus geometry for manifold-aware control.
// Implementations connect to a vector database, embedding store, or precomputed index.
export interface ManifoldProvider {
  /** Find k nearest neighbors to a point in the corpus. */
  knn(point: VectorN, k: number): Promise<VectorN[]>;
}

// v3.0: Manifold analysis snapshot written to metadata['manifold'] each step.
export interface ManifoldSnapshot {
  /** Tangential component of the agent's velocity (on-manifold motion). */
  velocityTangent: VectorN;
  /** Normal component of the agent's velocity (off-manifold drift). */
  velocityNormal: VectorN;
  /** Magnitude of normal velocity (scalar measure of drift). */
  normalDriftMagnitude: number;
  /** Local curvature κ (0 = flat, 1 = maximally curved). */
  curvature: number;
  /** Explained variance ratio of the tangent space. */
  explainedVariance: number;
  /** Distance from current position to manifold centroid. */
  distanceToCentroid: number;
  /** Distance from current position to the nearest neighbor. */
  distanceToNearestNeighbor: number;
  /** Number of neighbors found (sparse = fewer neighbors). */
  neighborCount: number;
  /** Whether the agent has drifted beyond the configured threshold. */
  isDrifting: boolean;
}

// v4.0: A time-indexed reference trajectory on the Grassmannian.
// The user provides this — CyberLoop does not construct it.
// Implementations might wrap a pre-computed array of subspaces from corpus analysis,
// or perform dynamic time warping internally.
export interface SubspaceTrajectory {
  /** Get the reference subspace basis at time t (step index or normalized [0,1]). */
  referenceAt(t: number): SubspaceBasis;
  /** Total number of reference points in the trajectory. */
  length: number;
}

// v4.0: Grassmannian analysis snapshot written to metadata['grassmannian'] each step.
export interface GrassmannianSnapshot {
  /** Current subspace basis (top-k principal directions of the sliding window). */
  currentBasis: SubspaceBasis;
  /** Principal angles between current subspace and reference (ascending, radians). */
  principalAngles: number[];
  /** Geodesic distance on Gr(k, d) to the reference subspace. */
  geodesicDistance: number;
  /** Mean principal angle (average structural alignment). */
  meanAngle: number;
  /** Maximum principal angle (worst-case dimensional divergence). */
  maxAngle: number;
  /** Explained variance ratio of the current subspace extraction (0–1). */
  explainedVariance: number;
  /** Number of vectors currently in the sliding window. */
  windowSize: number;
  /** Dimension of the extracted subspace (k). */
  subspaceDim: number;
  /** Whether the agent has drifted beyond the configured threshold. */
  isDrifting: boolean;
  /** Log map tangent vector (direction to rotate toward reference). Null if no reference. */
  steeringDirection: VectorN[] | null;
}

// The v2.1 Configuration
export interface KinematicsConfig {
  ProcessNoise: number; // Q for EKF
  MeasureNoise: number; // R for EKF
  PID: {
    Kp: number;
    Ki: number;
    Kd: number;
  };
  // Threshold for semantic whiplash (cosine similarity or angle)
  // If sin(theta) > maxDeviation, trigger correction
  MaxDeviation: number;
}
