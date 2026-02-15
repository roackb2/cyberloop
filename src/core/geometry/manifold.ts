/**
 * Riemannian manifold operations for CyberLoop v3.0.
 *
 * This module approximates the local geometry of a data manifold using
 * Principal Component Analysis on k nearest neighbors. It enables the
 * control layer to distinguish between on-manifold motion (tangent) and
 * off-manifold drift (normal).
 *
 * **Key optimization:** Uses the Gramian dual trick — instead of
 * diagonalizing the d×d covariance matrix (O(d³)), we diagonalize the
 * k×k Gramian matrix (O(k³) where k << d). The non-zero eigenvalues
 * are identical.
 *
 * @module geometry/manifold
 */

import { EigenvalueDecomposition, Matrix } from 'ml-matrix';

import type { VectorN } from '../kinematics/types';
import { dot, norm, scale, subtract } from './vector';

/**
 * Local geometry at a point on the data manifold.
 */
export interface LocalGeometry {
  /** Orthonormal basis spanning the tangent plane (valid directions). */
  tangentBasis: VectorN[];
  /** Orthonormal basis spanning the normal space (drift directions). */
  normalBasis: VectorN[];
  /** Eigenvalues from PCA (descending order). */
  eigenvalues: number[];
  /** Local curvature κ (0 = flat, 1 = maximally curved / isotropic). */
  curvature: number;
  /** Explained variance ratio of the tangent space (0–1). */
  explainedVariance: number;
  /** Mean of the neighborhood (centroid). */
  centroid: VectorN;
}

/**
 * Compute the centroid (mean) of a set of vectors.
 */
export function centroid(vectors: VectorN[]): VectorN {
  const d = vectors[0].length;
  const mean = new Array<number>(d).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < d; i++) {
      mean[i] += v[i];
    }
  }
  const n = vectors.length;
  for (let i = 0; i < d; i++) {
    mean[i] /= n;
  }
  return mean;
}

/**
 * Compute local curvature from eigenvalues.
 *
 * κ ≈ 1 - (Σ top eigenvalues) / (Σ all eigenvalues)
 *
 * - κ ≈ 0: flat terrain (data lies in a low-dimensional subspace)
 * - κ ≈ 1: isotropic / maximally curved (no dominant directions)
 *
 * @param eigenvalues - Eigenvalues in descending order
 * @param topK - Number of top eigenvalues to consider as "tangent"
 */
export function curvature(eigenvalues: number[], topK: number): number {
  const total = eigenvalues.reduce((s, v) => s + v, 0);
  if (total <= 0) return 1; // No variance → maximally uncertain
  const topSum = eigenvalues.slice(0, topK).reduce((s, v) => s + v, 0);
  return 1 - topSum / total;
}

/**
 * Determine the number of principal components that explain at least
 * `threshold` fraction of the total variance.
 *
 * @param eigenvalues - Eigenvalues in descending order
 * @param threshold - Explained variance threshold (default 0.8 = 80%)
 * @returns Number of components needed
 */
export function autoTopK(eigenvalues: number[], threshold = 0.8): number {
  const total = eigenvalues.reduce((s, v) => s + v, 0);
  if (total <= 0) return eigenvalues.length;
  let cumulative = 0;
  for (let i = 0; i < eigenvalues.length; i++) {
    cumulative += eigenvalues[i];
    if (cumulative / total >= threshold) return i + 1;
  }
  return eigenvalues.length;
}

/**
 * Compute the local geometry of a data manifold at a point, given its
 * k nearest neighbors.
 *
 * Uses the **Gramian dual trick**: instead of the d×d covariance matrix
 * C = X^T X, we compute the k×k Gramian G = X X^T. The non-zero
 * eigenvalues of G are identical to those of C, and the eigenvectors
 * of C can be recovered as u_i = X^T v_i / sqrt(λ_i).
 *
 * @param neighbors - k nearest neighbor vectors (each of dimension d)
 * @param topK - Number of principal components for tangent space.
 *               If omitted, auto-selects to explain 80% of variance.
 * @returns Local geometry (tangent/normal basis, curvature, etc.)
 */
export function localPCA(neighbors: VectorN[], topK?: number): LocalGeometry {
  const k = neighbors.length;
  const d = neighbors[0].length;

  // Degenerate case: single point → no geometry computable
  if (k < 2) {
    return {
      tangentBasis: [],
      normalBasis: [],
      eigenvalues: [],
      curvature: 1,
      explainedVariance: 0,
      centroid: neighbors[0] ?? new Array<number>(d).fill(0),
    };
  }

  // 1. Center the data (subtract mean)
  const mean = centroid(neighbors);
  const centered: number[][] = neighbors.map((v) =>
    v.map((val, i) => val - mean[i]),
  );

  // 2. Build the centered data matrix X (k × d)
  const X = new Matrix(centered);

  // 3. Compute Gramian G = X X^T (k × k)
  // PERF: This is O(k²·d) for the multiplication + O(k³) for eigendecomposition.
  // For k ≈ 50 and d ≈ 1536, this is ~4M ops — well within sub-ms on modern CPUs.
  // The real bottleneck is the k-NN query upstream, not this math.
  const G = X.mmul(X.transpose());

  // Scale by 1/(k-1) for unbiased covariance estimate
  const scaleFactor = 1 / (k - 1);
  const Gscaled = Matrix.mul(G, scaleFactor);

  // 4. Eigendecompose G (symmetric → real eigenvalues)
  const evd = new EigenvalueDecomposition(Gscaled);
  const rawEigenvalues = evd.realEigenvalues;
  const V = evd.eigenvectorMatrix; // k × k, columns are eigenvectors of G

  // 5. Sort eigenvalues descending and track indices
  const indexed = rawEigenvalues.map((val, i) => ({ val: Math.max(val, 0), i }));
  indexed.sort((a, b) => b.val - a.val);

  const sortedEigenvalues = indexed.map((e) => e.val);

  // 6. Determine topK (auto or explicit)
  const effectiveTopK = topK ?? autoTopK(sortedEigenvalues);

  // 7. Map eigenvectors of G back to d-dimensional space
  //    u_i = X^T v_i / sqrt(λ_i)
  //    Then normalize to get orthonormal basis vectors.
  const allBasis: VectorN[] = [];
  for (const entry of indexed) {
    if (entry.val < 1e-12) {
      // Eigenvalue ≈ 0 → this direction has no variance, skip
      break;
    }
    // Extract eigenvector v_i (column of V)
    const vi = V.getColumn(entry.i);
    const viMat = new Matrix([vi]).transpose(); // k × 1

    // u_i = X^T * v_i (d × 1)
    const ui = X.transpose().mmul(viMat);
    const uiVec = ui.to1DArray();

    // Normalize to unit length
    const uiNorm = norm(uiVec);
    if (uiNorm < 1e-12) continue;
    allBasis.push(scale(uiVec, 1 / uiNorm));
  }

  // 8. Split into tangent (top) and normal (rest)
  const tangentBasis = allBasis.slice(0, effectiveTopK);
  const normalBasis = allBasis.slice(effectiveTopK);

  // 9. Compute curvature and explained variance
  const kappa = curvature(sortedEigenvalues, effectiveTopK);
  const totalVariance = sortedEigenvalues.reduce((s, v) => s + v, 0);
  const tangentVariance = sortedEigenvalues.slice(0, effectiveTopK).reduce((s, v) => s + v, 0);
  const explainedVar = totalVariance > 0 ? tangentVariance / totalVariance : 0;

  return {
    tangentBasis,
    normalBasis,
    eigenvalues: sortedEigenvalues,
    curvature: kappa,
    explainedVariance: explainedVar,
    centroid: mean,
  };
}

/**
 * Project a vector onto the subspace spanned by the given orthonormal basis.
 *
 * v_projected = Σ (v · u_i) * u_i
 */
export function projectOnto(v: VectorN, basis: VectorN[]): VectorN {
  const d = v.length;
  const result = new Array<number>(d).fill(0);
  for (const u of basis) {
    const coeff = dot(v, u);
    for (let i = 0; i < d; i++) {
      result[i] += coeff * u[i];
    }
  }
  return result;
}

/**
 * Decompose a vector into tangent and normal components relative to a
 * tangent basis.
 *
 * v = v_tangent + v_normal
 *
 * - v_tangent: on-manifold component (projection onto tangent space)
 * - v_normal: off-manifold component (remainder = drift)
 */
export function decompose(
  v: VectorN,
  tangentBasis: VectorN[],
): { tangent: VectorN; normal: VectorN } {
  const tangent = projectOnto(v, tangentBasis);
  const normal = subtract(v, tangent);
  return { tangent, normal };
}

/**
 * Compute the distance from a point to the manifold centroid.
 */
export function distanceToCentroid(point: VectorN, manifoldCentroid: VectorN): number {
  return norm(subtract(point, manifoldCentroid));
}
