import { describe, expect, it } from 'vitest';

import type { SubspaceBasis } from '../../../../src/core/geometry/grassmannian';
import {
  compareSubspaces,
  extractSubspace,
  geodesicDistance,
  incrementalSubspaceUpdate,
  logMap,
  principalAngles,
  subspaceProjectionError,
} from '../../../../src/core/geometry/grassmannian';
import { norm } from '../../../../src/core/geometry/vector';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a standard basis vector e_i in ℝ^d */
function basisVector(d: number, i: number): number[] {
  const v = new Array<number>(d).fill(0);
  v[i] = 1;
  return v;
}

/** Check that a set of vectors is approximately orthonormal */
function isOrthonormal(basis: SubspaceBasis, tol = 1e-6): boolean {
  for (let i = 0; i < basis.length; i++) {
    // Unit length
    const n = norm(basis[i]);
    if (Math.abs(n - 1) > tol) return false;
    // Orthogonal to all others
    for (let j = i + 1; j < basis.length; j++) {
      let dot = 0;
      for (let k = 0; k < basis[i].length; k++) {
        dot += basis[i][k] * basis[j][k];
      }
      if (Math.abs(dot) > tol) return false;
    }
  }
  return true;
}

// ─── extractSubspace ─────────────────────────────────────────────────────────

describe('extractSubspace', () => {
  it('returns null for fewer than 2 vectors', () => {
    expect(extractSubspace([[1, 2, 3]])).toBeNull();
    expect(extractSubspace([])).toBeNull();
  });

  it('returns null for zero-dimensional vectors', () => {
    expect(extractSubspace([[], []])).toBeNull();
  });

  it('extracts a 1D subspace from collinear points', () => {
    // Points along the x-axis in ℝ^3
    const window = [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ];
    const result = extractSubspace(window, 1);
    expect(result).not.toBeNull();
    expect(result!.subspaceDim).toBe(1);
    expect(result!.ambientDim).toBe(3);
    // The basis should be approximately [±1, 0, 0]
    expect(Math.abs(result!.basis[0][0])).toBeCloseTo(1, 4);
    expect(Math.abs(result!.basis[0][1])).toBeCloseTo(0, 4);
    expect(Math.abs(result!.basis[0][2])).toBeCloseTo(0, 4);
    // Explained variance should be ~1.0 (all variance in one direction)
    expect(result!.explainedVariance).toBeGreaterThan(0.99);
  });

  it('extracts a 2D subspace from planar data', () => {
    // Points in the xy-plane of ℝ^4
    const window = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [-1, 1, 0, 0],
      [0.5, -0.5, 0, 0],
    ];
    const result = extractSubspace(window, 2);
    expect(result).not.toBeNull();
    expect(result!.subspaceDim).toBe(2);
    expect(result!.ambientDim).toBe(4);
    expect(isOrthonormal(result!.basis)).toBe(true);
    // The basis should span the xy-plane (z and w components ≈ 0)
    for (const bv of result!.basis) {
      expect(Math.abs(bv[2])).toBeCloseTo(0, 4);
      expect(Math.abs(bv[3])).toBeCloseTo(0, 4);
    }
  });

  it('auto-selects k when not specified', () => {
    // 2D data in ℝ^5 — should auto-select k=2
    const window = [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [1, 1, 0, 0, 0],
      [-1, 2, 0, 0, 0],
    ];
    const result = extractSubspace(window);
    expect(result).not.toBeNull();
    // Should pick k=2 since all variance is in first 2 dimensions
    expect(result!.subspaceDim).toBeLessThanOrEqual(3);
    expect(result!.explainedVariance).toBeGreaterThan(0.8);
  });

  it('returns orthonormal basis', () => {
    const window = [
      [1, 2, 3, 4],
      [4, 3, 2, 1],
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [2, 2, 2, 2],
    ];
    const result = extractSubspace(window, 2);
    expect(result).not.toBeNull();
    expect(isOrthonormal(result!.basis)).toBe(true);
  });

  it('handles high-dimensional vectors', () => {
    // 50-dimensional vectors (realistic embedding dimension)
    const d = 50;
    const window: number[][] = [];
    for (let i = 0; i < 10; i++) {
      const v = new Array<number>(d).fill(0);
      // Data primarily in first 3 dimensions
      v[0] = Math.sin(i);
      v[1] = Math.cos(i);
      v[2] = i * 0.1;
      // Small noise in other dimensions
      for (let j = 3; j < d; j++) {
        v[j] = (Math.random() - 0.5) * 0.001;
      }
      window.push(v);
    }
    const result = extractSubspace(window, 3);
    expect(result).not.toBeNull();
    expect(result!.subspaceDim).toBe(3);
    expect(result!.ambientDim).toBe(d);
    expect(isOrthonormal(result!.basis)).toBe(true);
  });
});

// ─── principalAngles ─────────────────────────────────────────────────────────

describe('principalAngles', () => {
  it('returns empty for empty bases', () => {
    expect(principalAngles([], [])).toEqual([]);
    expect(principalAngles([[1, 0]], [])).toEqual([]);
    expect(principalAngles([], [[1, 0]])).toEqual([]);
  });

  it('returns 0 for identical subspaces', () => {
    const basis: SubspaceBasis = [
      basisVector(4, 0),
      basisVector(4, 1),
    ];
    const angles = principalAngles(basis, basis);
    expect(angles.length).toBe(2);
    for (const angle of angles) {
      expect(angle).toBeCloseTo(0, 4);
    }
  });

  it('returns π/2 for orthogonal subspaces', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const basisB: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
    const angles = principalAngles(basisA, basisB);
    expect(angles.length).toBe(2);
    for (const angle of angles) {
      expect(angle).toBeCloseTo(Math.PI / 2, 4);
    }
  });

  it('returns one 0 and one π/2 for partially overlapping subspaces', () => {
    // A spans {e1, e2}, B spans {e1, e3}
    // They share e1 (angle 0) but e2 ⊥ e3 (angle π/2)
    const basisA: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const basisB: SubspaceBasis = [basisVector(3, 0), basisVector(3, 2)];
    const angles = principalAngles(basisA, basisB);
    expect(angles.length).toBe(2);
    // Sorted ascending: [0, π/2]
    expect(angles[0]).toBeCloseTo(0, 4);
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 4);
  });

  it('handles different-sized subspaces (min(k_a, k_b) angles)', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0)]; // 1D
    const basisB: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)]; // 2D
    const angles = principalAngles(basisA, basisB);
    // min(1, 2) = 1 angle
    expect(angles.length).toBe(1);
    expect(angles[0]).toBeCloseTo(0, 4); // e1 is in both
  });

  it('returns angles in ascending order', () => {
    // Rotated subspace — should have angles between 0 and π/2
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const basisA: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const basisB: SubspaceBasis = [
      [cos45, sin45, 0],
      [0, 0, 1],
    ];
    const angles = principalAngles(basisA, basisB);
    expect(angles.length).toBe(2);
    // Should be sorted ascending
    expect(angles[0]).toBeLessThanOrEqual(angles[1]);
  });
});

// ─── geodesicDistance ─────────────────────────────────────────────────────────

describe('geodesicDistance', () => {
  it('returns 0 for identical subspaces', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    expect(geodesicDistance(basis, basis)).toBeCloseTo(0, 4);
  });

  it('returns π/2 * sqrt(k) for fully orthogonal k-dimensional subspaces', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const basisB: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
    // Each angle is π/2, so distance = sqrt(2 * (π/2)²) = (π/2) * sqrt(2)
    const expected = (Math.PI / 2) * Math.sqrt(2);
    expect(geodesicDistance(basisA, basisB)).toBeCloseTo(expected, 4);
  });

  it('returns 0 for empty bases', () => {
    expect(geodesicDistance([], [])).toBe(0);
  });

  it('is symmetric', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const basisB: SubspaceBasis = [basisVector(4, 1), basisVector(4, 2)];
    const dAB = geodesicDistance(basisA, basisB);
    const dBA = geodesicDistance(basisB, basisA);
    expect(dAB).toBeCloseTo(dBA, 10);
  });
});

// ─── compareSubspaces ────────────────────────────────────────────────────────

describe('compareSubspaces', () => {
  it('returns zero comparison for empty bases', () => {
    const result = compareSubspaces([], []);
    expect(result.geodesicDistance).toBe(0);
    expect(result.meanAngle).toBe(0);
    expect(result.maxAngle).toBe(0);
    expect(result.principalAngles).toEqual([]);
  });

  it('returns full comparison for non-trivial subspaces', () => {
    const basisA: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const basisB: SubspaceBasis = [basisVector(3, 0), basisVector(3, 2)];
    const result = compareSubspaces(basisA, basisB);

    expect(result.principalAngles.length).toBe(2);
    expect(result.geodesicDistance).toBeGreaterThan(0);
    expect(result.meanAngle).toBeGreaterThan(0);
    expect(result.maxAngle).toBeGreaterThanOrEqual(result.meanAngle);
  });

  it('maxAngle is the largest principal angle', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const basisB: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
    const result = compareSubspaces(basisA, basisB);
    expect(result.maxAngle).toBeCloseTo(Math.PI / 2, 4);
  });
});

// ─── logMap ──────────────────────────────────────────────────────────────────

describe('logMap', () => {
  it('returns empty for empty bases', () => {
    expect(logMap([], [])).toEqual([]);
    expect(logMap([[1, 0]], [])).toEqual([]);
    expect(logMap([], [[1, 0]])).toEqual([]);
  });

  it('returns zero tangent vector for identical subspaces', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const delta = logMap(basis, basis);
    expect(delta.length).toBe(2);
    for (const v of delta) {
      expect(norm(v)).toBeCloseTo(0, 4);
    }
  });

  it('returns non-zero tangent vector for different subspaces', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const basisB: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
    const delta = logMap(basisA, basisB);
    expect(delta.length).toBe(2);
    // Should have non-zero magnitude
    const totalNorm = delta.reduce((s, v) => s + norm(v), 0);
    expect(totalNorm).toBeGreaterThan(0);
  });

  it('tangent vector points toward the target subspace', () => {
    // A = span{e1}, B = span{e2} in ℝ^3
    const basisA: SubspaceBasis = [basisVector(3, 0)];
    const basisB: SubspaceBasis = [basisVector(3, 1)];
    const delta = logMap(basisA, basisB);
    expect(delta.length).toBe(1);
    // The tangent should be in the e2 direction (orthogonal to e1, toward e2)
    expect(Math.abs(delta[0][1])).toBeGreaterThan(0.5);
  });

  it('handles different-sized bases by using min(k_a, k_b)', () => {
    const basisA: SubspaceBasis = [basisVector(4, 0)];
    const basisB: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
    const delta = logMap(basisA, basisB);
    expect(delta.length).toBe(1); // min(1, 2)
  });
});

// ─── incrementalSubspaceUpdate ───────────────────────────────────────────────

describe('incrementalSubspaceUpdate', () => {
  it('returns a copy when new vector is already in the subspace', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    // Vector in the xy-plane — already explained by the basis
    const newVec = [0.5, 0.5, 0];
    const updated = incrementalSubspaceUpdate(basis, newVec);
    expect(updated.length).toBe(2);
    expect(isOrthonormal(updated)).toBe(true);
    // Should be essentially unchanged
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        expect(updated[i][j]).toBeCloseTo(basis[i][j], 4);
      }
    }
  });

  it('rotates toward novelty when new vector is outside the subspace', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    // Vector with a z-component (novelty)
    const newVec = [0, 0, 1];
    const updated = incrementalSubspaceUpdate(basis, newVec, 0.5);
    expect(updated.length).toBe(2);
    expect(isOrthonormal(updated)).toBe(true);
    // The last basis vector should have rotated toward z
    const zComponent = Math.abs(updated[1][2]);
    expect(zComponent).toBeGreaterThan(0.1);
  });

  it('maintains orthonormality after update', () => {
    const basis: SubspaceBasis = [
      [0.6, 0.8, 0],
      [-0.8, 0.6, 0],
    ];
    // Normalize (they should already be orthonormal)
    const newVec = [0.1, 0.2, 0.9];
    const updated = incrementalSubspaceUpdate(basis, newVec, 0.3);
    expect(isOrthonormal(updated)).toBe(true);
  });

  it('returns empty basis unchanged', () => {
    const updated = incrementalSubspaceUpdate([], [1, 2, 3]);
    expect(updated).toEqual([]);
  });

  it('respects forget factor (small α = slow adaptation)', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const newVec = [0, 0, 1];

    const slowUpdate = incrementalSubspaceUpdate(basis, newVec, 0.01);
    const fastUpdate = incrementalSubspaceUpdate(basis, newVec, 0.9);

    // Fast update should rotate more toward z than slow update
    const slowZ = Math.abs(slowUpdate[1][2]);
    const fastZ = Math.abs(fastUpdate[1][2]);
    expect(fastZ).toBeGreaterThan(slowZ);
  });
});

// ─── subspaceProjectionError ─────────────────────────────────────────────────

describe('subspaceProjectionError', () => {
  it('returns 0 for a vector in the subspace', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const v = [3, 4, 0]; // in the xy-plane
    expect(subspaceProjectionError(v, basis)).toBeCloseTo(0, 10);
  });

  it('returns full norm for a vector orthogonal to the subspace', () => {
    const basis: SubspaceBasis = [basisVector(3, 0), basisVector(3, 1)];
    const v = [0, 0, 5]; // along z, orthogonal to xy-plane
    expect(subspaceProjectionError(v, basis)).toBeCloseTo(5, 10);
  });

  it('returns partial error for a vector partially in the subspace', () => {
    const basis: SubspaceBasis = [basisVector(3, 0)]; // x-axis only
    const v = [3, 4, 0]; // in xy-plane but basis only captures x
    // Projection onto x-axis: [3, 0, 0], residue: [0, 4, 0], norm = 4
    expect(subspaceProjectionError(v, basis)).toBeCloseTo(4, 10);
  });

  it('returns full norm for empty basis', () => {
    const v = [3, 4, 0];
    expect(subspaceProjectionError(v, [])).toBeCloseTo(5, 10);
  });
});

// ─── Integration: extractSubspace → compareSubspaces ─────────────────────────

describe('integration: extract and compare', () => {
  it('identical windows produce geodesic distance ≈ 0', () => {
    const window = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [-1, 1, 0, 0],
    ];
    const subA = extractSubspace(window, 2);
    const subB = extractSubspace(window, 2);
    expect(subA).not.toBeNull();
    expect(subB).not.toBeNull();
    const dist = geodesicDistance(subA!.basis, subB!.basis);
    expect(dist).toBeCloseTo(0, 4);
  });

  it('orthogonal windows produce large geodesic distance', () => {
    const windowA = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
    ];
    const windowB = [
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [0, 0, 1, 1],
    ];
    const subA = extractSubspace(windowA, 2);
    const subB = extractSubspace(windowB, 2);
    expect(subA).not.toBeNull();
    expect(subB).not.toBeNull();
    const dist = geodesicDistance(subA!.basis, subB!.basis);
    // Should be close to (π/2) * sqrt(2) ≈ 2.22
    expect(dist).toBeGreaterThan(1.5);
  });

  it('slightly rotated windows produce small geodesic distance', () => {
    // Window A: data in xy-plane
    const windowA = [
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ];
    // Window B: data mostly in xy-plane with slight z perturbation
    const windowB = [
      [1, 0, 0.05],
      [0, 1, 0.05],
      [1, 1, 0.05],
    ];
    const subA = extractSubspace(windowA, 2);
    const subB = extractSubspace(windowB, 2);
    expect(subA).not.toBeNull();
    expect(subB).not.toBeNull();
    const dist = geodesicDistance(subA!.basis, subB!.basis);
    // Small perturbation → small distance
    expect(dist).toBeLessThan(0.5);
  });
});
