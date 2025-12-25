import { describe, expect, it } from 'vitest';

import {
  add,
  angleBetween,
  cosineSimilarity,
  dot,
  norm,
  normalize,
  project,
  reject,
  subtract
} from '../../../../src/core/kinematics/math';

describe('Kinematics Math Utilities', () => {
  const v1 = [1, 0, 0];
  const v2 = [0, 1, 0];
  const v3 = [1, 1, 0];
  const vZero = [0, 0, 0];

  it('should add vectors correctly', () => {
    expect(add(v1, v2)).toEqual([1, 1, 0]);
  });

  it('should subtract vectors correctly', () => {
    expect(subtract(v1, v2)).toEqual([1, -1, 0]);
  });

  it('should calculate dot product', () => {
    expect(dot(v1, v2)).toBe(0); // Orthogonal
    expect(dot(v1, v3)).toBe(1);
  });

  it('should calculate norm (magnitude)', () => {
    expect(norm(v1)).toBe(1);
    expect(norm(v3)).toBeCloseTo(Math.sqrt(2));
  });

  it('should normalize vectors', () => {
    const n = normalize(v3);
    expect(norm(n)).toBeCloseTo(1);
    expect(n[0]).toBeCloseTo(1 / Math.sqrt(2));
  });

  it('should handle zero vector normalization', () => {
    expect(normalize(vZero)).toEqual(vZero);
  });

  it('should project v3 onto v1', () => {
    // Projecting [1,1,0] onto [1,0,0] should give [1,0,0]
    expect(project(v3, v1)).toEqual([1, 0, 0]);
  });

  it('should reject v3 from v1', () => {
    // Rejecting [1,1,0] from [1,0,0] should give [0,1,0]
    expect(reject(v3, v1)).toEqual([0, 1, 0]);
  });

  it('should calculate cosine similarity', () => {
    expect(cosineSimilarity(v1, v2)).toBe(0);
    expect(cosineSimilarity(v1, v1)).toBe(1);
    expect(cosineSimilarity(v1, [-1, 0, 0])).toBe(-1);
  });

  it('should calculate angle between vectors', () => {
    expect(angleBetween(v1, v2)).toBeCloseTo(Math.PI / 2); // 90 degrees
    expect(angleBetween(v1, v1)).toBe(0);
  });
});
