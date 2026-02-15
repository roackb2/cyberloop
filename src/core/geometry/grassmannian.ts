/**
 * Grassmannian manifold operations for CyberLoop v4.0.
 *
 * This module provides the math for tracking and comparing **subspaces**
 * on the Grassmannian manifold Gr(k, d) — the space of all k-dimensional
 * subspaces of ℝ^d.
 *
 * A "subspace" is represented as an orthonormal basis matrix (d × k),
 * stored column-major as `VectorN[]` where each vector is a basis column.
 * This is the same convention used by `localPCA` in `manifold.ts`.
 *
 * **Key operations:**
 * - `extractSubspace` — SVD on a window of vectors → orthonormal basis
 * - `principalAngles` — canonical angles between two subspaces
 * - `geodesicDistance` — Riemannian distance on Gr(k, d)
 * - `logMap` — tangent vector pointing from one subspace toward another
 * - `incrementalSubspaceUpdate` — O(d·k) rank-1 update (avoids full SVD)
 * - `subspaceProjectionError` — how much of a vector lies outside a subspace
 *
 * @module geometry/grassmannian
 */

import { Matrix, SingularValueDecomposition } from 'ml-matrix';

import type { VectorN } from '../kinematics/types';
import { norm, scale, subtract } from './vector';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * An orthonormal basis representing a point on the Grassmannian Gr(k, d).
 *
 * Each element is a d-dimensional column vector. The array has k elements,
 * so the subspace is k-dimensional within ℝ^d.
 */
export type SubspaceBasis = VectorN[];

/**
 * Result of extracting a subspace from a window of vectors.
 */
export interface SubspaceExtraction {
  /** Orthonormal basis vectors (top-k left singular vectors). */
  basis: SubspaceBasis;
  /** Singular values (descending order). */
  singularValues: number[];
  /** Explained variance ratio of the top-k components (0–1). */
  explainedVariance: number;
  /** Dimension of the ambient space (d). */
  ambientDim: number;
  /** Dimension of the subspace (k). */
  subspaceDim: number;
}

/**
 * Result of comparing two subspaces on the Grassmannian.
 */
export interface SubspaceComparison {
  /** Principal angles between the two subspaces (in radians, ascending). */
  principalAngles: number[];
  /** Geodesic distance on Gr(k, d): sqrt(Σ θ_i²). */
  geodesicDistance: number;
  /** Mean principal angle (average structural alignment). */
  meanAngle: number;
  /** Maximum principal angle (worst-case dimensional divergence). */
  maxAngle: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Extract a subspace from a window of embedding vectors via SVD.
 *
 * Given m vectors of dimension d, computes the top-k left singular vectors
 * of the centered data matrix. These form an orthonormal basis for the
 * k-dimensional subspace that best captures the variance in the window.
 *
 * @param window - Array of m embedding vectors (each dimension d). Must have m ≥ 2.
 * @param k - Number of principal components to extract. If omitted, auto-selects
 *            to explain ≥ 80% of variance.
 * @returns Subspace extraction result, or null if the window is degenerate.
 */
export function extractSubspace(window: VectorN[], k?: number): SubspaceExtraction | null {
  const m = window.length;
  if (m < 2) return null;

  const d = window[0].length;
  if (d === 0) return null;

  // 1. Center the data (subtract mean)
  const mean = new Array<number>(d).fill(0);
  for (const v of window) {
    for (let i = 0; i < d; i++) {
      mean[i] += v[i];
    }
  }
  for (let i = 0; i < d; i++) {
    mean[i] /= m;
  }

  const centered = window.map((v) => v.map((val, i) => val - mean[i]));

  // 2. Build data matrix X (m × d) and compute SVD
  //    SVD gives X = U Σ V^T where V columns are the principal directions in ℝ^d
  const X = new Matrix(centered);
  const svd = new SingularValueDecomposition(X);

  const singularValues = svd.diagonal; // descending order
  const V = svd.rightSingularVectors; // d × min(m,d), columns are right singular vectors

  // 3. Determine effective k
  const totalVariance = singularValues.reduce((s, v) => s + v * v, 0);
  let effectiveK: number;

  if (k != null) {
    effectiveK = Math.min(k, singularValues.length, V.columns);
  } else {
    // Auto-select: explain ≥ 80% of variance
    effectiveK = autoSelectK(singularValues, 0.8);
  }

  // Ensure at least 1 component
  effectiveK = Math.max(1, effectiveK);

  // 4. Extract top-k right singular vectors as basis
  const basis: SubspaceBasis = [];
  for (let j = 0; j < effectiveK; j++) {
    if (j >= V.columns) break;
    const col = V.getColumn(j);
    // Verify it's unit-length (should be from SVD, but normalize for safety)
    const n = norm(col);
    if (n < 1e-12) break; // degenerate
    basis.push(n > 0.999 && n < 1.001 ? col : scale(col, 1 / n));
  }

  if (basis.length === 0) return null;

  // 5. Compute explained variance
  const topVariance = singularValues
    .slice(0, basis.length)
    .reduce((s, v) => s + v * v, 0);
  const explainedVariance = totalVariance > 0 ? topVariance / totalVariance : 0;

  return {
    basis,
    singularValues,
    explainedVariance,
    ambientDim: d,
    subspaceDim: basis.length,
  };
}

/**
 * Compute the principal angles between two subspaces.
 *
 * Given orthonormal bases U_a (d × k_a) and U_b (d × k_b), computes the
 * canonical angles θ_i via SVD of U_a^T U_b.
 *
 * The principal angles are in [0, π/2] and returned in ascending order.
 * - θ ≈ 0: the corresponding dimensions are aligned
 * - θ ≈ π/2: the corresponding dimensions are orthogonal
 *
 * @param basisA - First subspace basis (array of orthonormal vectors)
 * @param basisB - Second subspace basis (array of orthonormal vectors)
 * @returns Array of principal angles in radians (ascending), length = min(k_a, k_b)
 */
export function principalAngles(basisA: SubspaceBasis, basisB: SubspaceBasis): number[] {
  if (basisA.length === 0 || basisB.length === 0) return [];

  const d = basisA[0].length;

  // Build matrices: U_a is d × k_a, U_b is d × k_b
  const Ua = basisToMatrix(basisA, d);
  const Ub = basisToMatrix(basisB, d);

  // M = U_a^T * U_b (k_a × k_b)
  const M = Ua.transpose().mmul(Ub);

  // SVD of M: singular values σ_i = cos(θ_i)
  const svd = new SingularValueDecomposition(M);
  const sigmas = svd.diagonal;

  // The number of principal angles is min(k_a, k_b).
  // ml-matrix may return more singular values; truncate.
  const numAngles = Math.min(basisA.length, basisB.length);
  const truncated = sigmas.slice(0, numAngles);

  // Convert to angles: θ_i = arccos(clamp(σ_i, 0, 1))
  const angles = truncated.map((sigma) => Math.acos(Math.min(1, Math.max(0, sigma))));

  // Sort ascending (smallest angle = most aligned dimension)
  angles.sort((a, b) => a - b);

  return angles;
}

/**
 * Compute the geodesic distance between two subspaces on the Grassmannian.
 *
 * d_Gr(U_a, U_b) = sqrt(Σ θ_i²)
 *
 * where θ_i are the principal angles.
 *
 * - d_Gr ≈ 0: Perfect structural alignment
 * - d_Gr ≈ (π/2)·sqrt(k): Maximum divergence (all dimensions orthogonal)
 *
 * @param basisA - First subspace basis
 * @param basisB - Second subspace basis
 * @returns Geodesic distance (non-negative scalar)
 */
export function geodesicDistance(basisA: SubspaceBasis, basisB: SubspaceBasis): number {
  const angles = principalAngles(basisA, basisB);
  if (angles.length === 0) return 0;
  return Math.sqrt(angles.reduce((sum, theta) => sum + theta * theta, 0));
}

/**
 * Compare two subspaces, returning principal angles, geodesic distance,
 * and summary statistics.
 *
 * This is the primary comparison function for the middleware layer.
 *
 * @param basisA - Current subspace basis
 * @param basisB - Reference subspace basis
 * @returns Full comparison result
 */
export function compareSubspaces(
  basisA: SubspaceBasis,
  basisB: SubspaceBasis,
): SubspaceComparison {
  const angles = principalAngles(basisA, basisB);

  if (angles.length === 0) {
    return {
      principalAngles: [],
      geodesicDistance: 0,
      meanAngle: 0,
      maxAngle: 0,
    };
  }

  const gDist = Math.sqrt(angles.reduce((sum, theta) => sum + theta * theta, 0));
  const meanAngle = angles.reduce((sum, theta) => sum + theta, 0) / angles.length;
  const maxAngle = angles[angles.length - 1]; // already sorted ascending

  return {
    principalAngles: angles,
    geodesicDistance: gDist,
    meanAngle,
    maxAngle,
  };
}

/**
 * Compute the logarithmic map from U_curr to U_target on the Grassmannian.
 *
 * The log map gives a tangent vector (matrix) at U_curr that points toward
 * U_target. This represents the "direction" to rotate the current subspace
 * to align with the target.
 *
 * Δ = U_target - U_curr * (U_curr^T * U_target)
 *
 * The result is a d × k matrix in the tangent space at U_curr.
 * Its Frobenius norm equals the geodesic distance (for small distances).
 *
 * @param basisCurr - Current subspace basis
 * @param basisTarget - Target subspace basis
 * @returns Tangent vector as an array of d-dimensional vectors (one per basis direction)
 */
export function logMap(basisCurr: SubspaceBasis, basisTarget: SubspaceBasis): VectorN[] {
  if (basisCurr.length === 0 || basisTarget.length === 0) return [];

  const d = basisCurr[0].length;
  const k = Math.min(basisCurr.length, basisTarget.length);

  // Use only the first k vectors from each basis for compatible dimensions
  const Uc = basisToMatrix(basisCurr.slice(0, k), d);
  const Ut = basisToMatrix(basisTarget.slice(0, k), d);

  // Δ = U_target - U_curr * (U_curr^T * U_target)
  // This is the component of U_target that is orthogonal to U_curr
  const projection = Uc.mmul(Uc.transpose().mmul(Ut)); // d × k
  const delta = Matrix.sub(Ut, projection); // d × k

  // Convert back to array of vectors
  const result: VectorN[] = [];
  for (let j = 0; j < delta.columns; j++) {
    result.push(delta.getColumn(j));
  }
  return result;
}

/**
 * Incrementally update a subspace basis when a new vector arrives.
 *
 * This avoids full SVD recomputation by performing a rank-1 update:
 * 1. Project the new vector onto the current subspace
 * 2. Compute the residue (novelty outside the subspace)
 * 3. If the residue is significant, rotate the basis toward it
 *
 * Complexity: O(d·k) per update vs O(d·m²) for full SVD.
 *
 * @param basis - Current orthonormal basis (will not be mutated)
 * @param newVector - New embedding vector to incorporate
 * @param forgetFactor - How much to rotate toward novelty (0 = ignore, 1 = fully absorb).
 *                       Default: 0.1 (gentle adaptation). This is analogous to a
 *                       learning rate in Oja's rule.
 * @param noveltyThreshold - Minimum residue norm to trigger rotation. Default: 1e-6.
 * @returns Updated orthonormal basis (same dimensionality as input)
 */
export function incrementalSubspaceUpdate(
  basis: SubspaceBasis,
  newVector: VectorN,
  forgetFactor = 0.1,
  noveltyThreshold = 1e-6,
): SubspaceBasis {
  if (basis.length === 0) return basis;

  const d = newVector.length;
  const k = basis.length;

  // 1. Project: w = U^T * y_new (how much is explained)
  const coefficients: number[] = [];
  for (let j = 0; j < k; j++) {
    let dotProduct = 0;
    for (let i = 0; i < d; i++) {
      dotProduct += basis[j][i] * newVector[i];
    }
    coefficients.push(dotProduct);
  }

  // 2. Reconstruct projection: U * w
  const projected = new Array<number>(d).fill(0);
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < d; i++) {
      projected[i] += coefficients[j] * basis[j][i];
    }
  }

  // 3. Residue: r = y_new - U * w (novelty)
  const residue = subtract(newVector, projected);
  const residueNorm = norm(residue);

  // If residue is negligible, the new vector is already well-explained
  if (residueNorm < noveltyThreshold) {
    return basis.map((v) => [...v]); // return a copy
  }

  // 4. Normalize residue to get the novelty direction
  const noveltyDir = scale(residue, 1 / residueNorm);

  // 5. Rotate each basis vector slightly toward the novelty direction
  //    using a simplified Oja-like update:
  //    u_j' = normalize(u_j + α * (u_j^T * y_new) * noveltyDir)
  //
  //    The forget factor α controls how quickly the subspace adapts.
  //    We only rotate the basis vector with the smallest eigenvalue
  //    contribution (last one) to maintain stability.
  const updatedBasis: SubspaceBasis = basis.map((v) => [...v]);

  // Rotate the last basis vector (weakest direction) toward novelty
  const lastIdx = k - 1;
  const lastVec = updatedBasis[lastIdx];
  for (let i = 0; i < d; i++) {
    lastVec[i] = lastVec[i] * (1 - forgetFactor) + noveltyDir[i] * forgetFactor;
  }

  // Re-orthonormalize via modified Gram-Schmidt
  for (let j = 0; j < k; j++) {
    // Subtract projections onto all previous basis vectors
    for (let p = 0; p < j; p++) {
      let dot = 0;
      for (let i = 0; i < d; i++) {
        dot += updatedBasis[j][i] * updatedBasis[p][i];
      }
      for (let i = 0; i < d; i++) {
        updatedBasis[j][i] -= dot * updatedBasis[p][i];
      }
    }
    // Normalize
    const n = norm(updatedBasis[j]);
    if (n < 1e-12) {
      // Degenerate: replace with novelty direction
      updatedBasis[j] = [...noveltyDir];
    } else {
      for (let i = 0; i < d; i++) {
        updatedBasis[j][i] /= n;
      }
    }
  }

  return updatedBasis;
}

/**
 * Compute how much of a vector lies outside a subspace.
 *
 * This is the norm of the rejection (component orthogonal to the subspace).
 * Useful for detecting when new data introduces dimensions not captured
 * by the current subspace.
 *
 * @param vector - The vector to test
 * @param basis - Orthonormal subspace basis
 * @returns Norm of the component outside the subspace (0 = fully explained)
 */
export function subspaceProjectionError(vector: VectorN, basis: SubspaceBasis): number {
  if (basis.length === 0) return norm(vector);

  const d = vector.length;

  // Project onto subspace
  const projected = new Array<number>(d).fill(0);
  for (const u of basis) {
    let coeff = 0;
    for (let i = 0; i < d; i++) {
      coeff += vector[i] * u[i];
    }
    for (let i = 0; i < d; i++) {
      projected[i] += coeff * u[i];
    }
  }

  // Residue norm
  return norm(subtract(vector, projected));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Auto-select the number of components to explain at least `threshold`
 * fraction of total variance, based on singular values.
 *
 * @param singularValues - Singular values in descending order
 * @param threshold - Explained variance threshold (default 0.8)
 * @returns Number of components needed
 */
function autoSelectK(singularValues: number[], threshold = 0.8): number {
  const totalVariance = singularValues.reduce((s, v) => s + v * v, 0);
  if (totalVariance <= 0) return singularValues.length;

  let cumulative = 0;
  for (let i = 0; i < singularValues.length; i++) {
    cumulative += singularValues[i] * singularValues[i];
    if (cumulative / totalVariance >= threshold) return i + 1;
  }
  return singularValues.length;
}

/**
 * Convert a SubspaceBasis (array of column vectors) to a Matrix (d × k).
 */
function basisToMatrix(basis: SubspaceBasis, d: number): Matrix {
  const k = basis.length;
  const data = new Array<number[]>(d);
  for (let i = 0; i < d; i++) {
    data[i] = new Array<number>(k);
    for (let j = 0; j < k; j++) {
      data[i][j] = basis[j][i]; // transpose: basis[j] is column j
    }
  }
  return new Matrix(data);
}
