/**
 * Geometry module — pure math operations for CyberLoop's control layers.
 *
 * - `vector.ts` — Euclidean operations (v2.1+)
 * - `manifold.ts` — Riemannian PCA, curvature, tangent plane (v3.0, future)
 * - `grassmannian.ts` — SVD, principal angles, geodesic distance (v4.0, future)
 */
export {
  add,
  angleBetween,
  cosineSimilarity,
  dot,
  norm,
  normalize,
  project,
  reject,
  scale,
  subtract,
  toMatrix,
  toVector,
} from './vector';
