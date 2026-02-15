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
  /** Number of neighbors found (sparse = fewer neighbors). */
  neighborCount: number;
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
