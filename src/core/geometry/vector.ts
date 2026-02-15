/**
 * Euclidean vector operations for semantic embedding spaces.
 *
 * This module provides the foundational vector math used by CyberLoop's
 * control layers. It operates on arbitrary-dimensional vectors typed as
 * `VectorN`.
 *
 * **v2.1:** Used by PhysicsEngine (EKF) and PIDController.
 * **v3.0:** Will be extended by `manifold.ts` (PCA, curvature, tangent plane).
 * **v4.0:** Will be extended by `grassmannian.ts` (SVD, principal angles, geodesic).
 *
 * @module geometry/vector
 */

import { Matrix } from 'ml-matrix';

import type { VectorN } from '../kinematics/types';

// Convert array to Matrix (column vector)
export const toMatrix = (v: VectorN): Matrix => {
  return new Matrix([v]).transpose();
};

// Convert Matrix to array
export const toVector = (m: Matrix): VectorN => {
  return m.to1DArray();
};

export const add = (v1: VectorN, v2: VectorN): VectorN => {
  const m1 = toMatrix(v1);
  const m2 = toMatrix(v2);
  return toVector(Matrix.add(m1, m2));
};

export const subtract = (v1: VectorN, v2: VectorN): VectorN => {
  const m1 = toMatrix(v1);
  const m2 = toMatrix(v2);
  return toVector(Matrix.sub(m1, m2));
};

export const scale = (v: VectorN, scalar: number): VectorN => {
  const m = toMatrix(v);
  return toVector(Matrix.mul(m, scalar));
};

export const dot = (v1: VectorN, v2: VectorN): number => {
  const m1 = toMatrix(v1);
  const m2 = toMatrix(v2);
  // Dot product is v1^T * v2
  return m1.transpose().mmul(m2).get(0, 0);
};

export const norm = (v: VectorN): number => {
  const m = toMatrix(v);
  return m.norm('frobenius'); // Euclidean norm
};

export const normalize = (v: VectorN): VectorN => {
  const n = norm(v);
  if (n === 0) return v.map(() => 0);
  return scale(v, 1 / n);
};

// Projection of a onto b: proj_b(a) = (a . b / |b|^2) * b
export const project = (a: VectorN, b: VectorN): VectorN => {
  const bNormSq = dot(b, b);
  if (bNormSq === 0) return b.map(() => 0);
  const scalar = dot(a, b) / bNormSq;
  return scale(b, scalar);
};

// Rejection of a from b: a - proj_b(a)
export const reject = (a: VectorN, b: VectorN): VectorN => {
  const proj = project(a, b);
  return subtract(a, proj);
};

export const cosineSimilarity = (v1: VectorN, v2: VectorN): number => {
  const n1 = norm(v1);
  const n2 = norm(v2);
  if (n1 === 0 || n2 === 0) return 0;
  return dot(v1, v2) / (n1 * n2);
};

export const angleBetween = (v1: VectorN, v2: VectorN): number => {
  const cos = Math.max(-1, Math.min(1, cosineSimilarity(v1, v2)));
  return Math.acos(cos);
};
