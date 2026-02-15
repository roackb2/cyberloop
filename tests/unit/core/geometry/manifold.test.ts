import { describe, expect, it } from 'vitest';

import {
  autoTopK,
  centroid,
  curvature,
  decompose,
  distanceToCentroid,
  localPCA,
  projectOnto,
} from '../../../../src/core/geometry/manifold';
import { dot, norm } from '../../../../src/core/geometry/vector';

// ── Helpers ──────────────────────────────────────────────────────────

/** Check that two vectors are approximately equal. */
function expectVecClose(a: number[], b: number[], tol = 1e-6) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i]).toBeCloseTo(b[i], -Math.log10(tol));
  }
}

/** Check that a set of vectors is orthonormal. */
function expectOrthonormal(basis: number[][], tol = 1e-6) {
  for (let i = 0; i < basis.length; i++) {
    // Unit length
    expect(norm(basis[i])).toBeCloseTo(1, -Math.log10(tol));
    // Orthogonal to all others
    for (let j = i + 1; j < basis.length; j++) {
      expect(Math.abs(dot(basis[i], basis[j]))).toBeLessThan(tol);
    }
  }
}

// ── centroid ─────────────────────────────────────────────────────────

describe('centroid', () => {
  it('computes the mean of a set of vectors', () => {
    const vecs = [[1, 2, 3], [3, 4, 5], [5, 6, 7]];
    expectVecClose(centroid(vecs), [3, 4, 5]);
  });

  it('returns the vector itself for a single-element set', () => {
    expectVecClose(centroid([[7, 8, 9]]), [7, 8, 9]);
  });
});

// ── curvature ────────────────────────────────────────────────────────

describe('curvature', () => {
  it('returns 0 when all variance is in the top components', () => {
    // All variance in first 2 eigenvalues
    expect(curvature([10, 5, 0, 0], 2)).toBeCloseTo(0);
  });

  it('returns close to 1 when variance is spread evenly (isotropic)', () => {
    // Equal eigenvalues → maximally curved / no dominant direction
    const kappa = curvature([1, 1, 1, 1], 1);
    expect(kappa).toBeCloseTo(0.75);
  });

  it('returns 1 for zero total variance', () => {
    expect(curvature([0, 0, 0], 1)).toBe(1);
  });

  it('returns intermediate value for partial concentration', () => {
    // 10 out of 15 total → explained = 10/15 = 0.667 → κ = 0.333
    const kappa = curvature([10, 3, 2], 1);
    expect(kappa).toBeCloseTo(1 - 10 / 15);
  });
});

// ── autoTopK ─────────────────────────────────────────────────────────

describe('autoTopK', () => {
  it('selects minimum components to explain 80% variance', () => {
    // Total = 100. First eigenvalue = 90 → 90% > 80% → topK = 1
    expect(autoTopK([90, 5, 3, 2])).toBe(1);
  });

  it('needs more components when variance is spread', () => {
    // Total = 10. Need 8 to reach 80%.
    // 4 + 3 = 7 (70%) → not enough. 4 + 3 + 2 = 9 (90%) → topK = 3
    expect(autoTopK([4, 3, 2, 1])).toBe(3);
  });

  it('returns all components for zero variance', () => {
    expect(autoTopK([0, 0, 0])).toBe(3);
  });

  it('respects custom threshold', () => {
    // Total = 10. Need 95% = 9.5. 4+3+2 = 9 (90%) not enough. 4+3+2+1 = 10 → topK = 4
    expect(autoTopK([4, 3, 2, 1], 0.95)).toBe(4);
  });
});

// ── projectOnto ──────────────────────────────────────────────────────

describe('projectOnto', () => {
  it('projects onto a single basis vector', () => {
    const basis = [[1, 0, 0]]; // x-axis
    const v = [3, 4, 5];
    expectVecClose(projectOnto(v, basis), [3, 0, 0]);
  });

  it('projects onto a 2D subspace', () => {
    const basis = [[1, 0, 0], [0, 1, 0]]; // xy-plane
    const v = [3, 4, 5];
    expectVecClose(projectOnto(v, basis), [3, 4, 0]);
  });

  it('returns the vector itself when basis spans full space', () => {
    const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const v = [3, 4, 5];
    expectVecClose(projectOnto(v, basis), [3, 4, 5]);
  });

  it('returns zero vector for empty basis', () => {
    expectVecClose(projectOnto([3, 4, 5], []), [0, 0, 0]);
  });
});

// ── decompose ────────────────────────────────────────────────────────

describe('decompose', () => {
  it('splits a vector into tangent and normal components', () => {
    const tangentBasis = [[1, 0, 0], [0, 1, 0]]; // xy-plane
    const v = [3, 4, 5];
    const { tangent, normal } = decompose(v, tangentBasis);
    expectVecClose(tangent, [3, 4, 0]);
    expectVecClose(normal, [0, 0, 5]);
  });

  it('tangent + normal reconstructs the original vector', () => {
    const tangentBasis = [[1, 0, 0]];
    const v = [3, 4, 5];
    const { tangent, normal } = decompose(v, tangentBasis);
    const reconstructed = tangent.map((t, i) => t + normal[i]);
    expectVecClose(reconstructed, v);
  });

  it('tangent is orthogonal to normal when basis is orthonormal', () => {
    const tangentBasis = [[1, 0, 0], [0, 1, 0]];
    const v = [3, 4, 5];
    const { tangent, normal } = decompose(v, tangentBasis);
    expect(Math.abs(dot(tangent, normal))).toBeLessThan(1e-10);
  });
});

// ── distanceToCentroid ───────────────────────────────────────────────

describe('distanceToCentroid', () => {
  it('computes Euclidean distance', () => {
    expect(distanceToCentroid([3, 0, 0], [0, 0, 0])).toBeCloseTo(3);
  });

  it('returns 0 for identical points', () => {
    expect(distanceToCentroid([1, 2, 3], [1, 2, 3])).toBeCloseTo(0);
  });
});

// ── localPCA ─────────────────────────────────────────────────────────

describe('localPCA', () => {
  it('returns degenerate geometry for a single neighbor', () => {
    const result = localPCA([[1, 2, 3]]);
    expect(result.tangentBasis).toHaveLength(0);
    expect(result.normalBasis).toHaveLength(0);
    expect(result.eigenvalues).toHaveLength(0);
    expect(result.curvature).toBe(1);
    expect(result.explainedVariance).toBe(0);
    expectVecClose(result.centroid, [1, 2, 3]);
  });

  it('finds the dominant direction for data along one axis', () => {
    // Points spread along x-axis, no variance in y or z
    const neighbors = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ];
    const result = localPCA(neighbors, 1);

    // Tangent basis should be ~[1, 0, 0] (or [-1, 0, 0])
    expect(result.tangentBasis).toHaveLength(1);
    const tb = result.tangentBasis[0];
    expect(Math.abs(tb[0])).toBeCloseTo(1, 4);
    expect(Math.abs(tb[1])).toBeLessThan(1e-6);
    expect(Math.abs(tb[2])).toBeLessThan(1e-6);

    // Curvature should be ~0 (all variance in one direction)
    expect(result.curvature).toBeCloseTo(0, 1);

    // Explained variance should be ~1
    expect(result.explainedVariance).toBeCloseTo(1, 1);
  });

  it('finds a 2D tangent plane for data in a plane', () => {
    // Points in the xy-plane
    const neighbors = [
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
      [0.5, 0.5, 0],
      [-0.5, -0.5, 0],
    ];
    const result = localPCA(neighbors, 2);

    // Tangent basis should span the xy-plane
    expect(result.tangentBasis).toHaveLength(2);
    expectOrthonormal(result.tangentBasis);

    // Both tangent vectors should have ~0 z-component
    for (const tb of result.tangentBasis) {
      expect(Math.abs(tb[2])).toBeLessThan(1e-6);
    }

    // Curvature should be ~0 (all variance in 2 directions)
    expect(result.curvature).toBeCloseTo(0, 1);
  });

  it('returns orthonormal tangent and normal bases', () => {
    // Random-ish 5D data with variance mostly in first 2 dimensions
    const neighbors = [
      [1, 2, 0.01, 0, 0],
      [2, 1, -0.01, 0, 0],
      [3, 3, 0.02, 0, 0],
      [0, 1, -0.02, 0, 0],
      [2, 0, 0.01, 0, 0],
      [1, 3, -0.01, 0, 0],
    ];
    const result = localPCA(neighbors, 2);

    expectOrthonormal(result.tangentBasis);
    if (result.normalBasis.length > 0) {
      expectOrthonormal(result.normalBasis);
    }

    // Tangent and normal should be mutually orthogonal
    for (const t of result.tangentBasis) {
      for (const n of result.normalBasis) {
        expect(Math.abs(dot(t, n))).toBeLessThan(1e-4);
      }
    }
  });

  it('auto-selects topK when not specified', () => {
    // Data along x-axis → 1 dominant component should explain > 80%
    const neighbors = [
      [0, 0.01, 0.01],
      [1, -0.01, 0.02],
      [2, 0.02, -0.01],
      [3, -0.02, 0.01],
      [4, 0.01, -0.02],
    ];
    const result = localPCA(neighbors); // auto topK
    expect(result.tangentBasis.length).toBeGreaterThanOrEqual(1);
    expect(result.explainedVariance).toBeGreaterThan(0.8);
  });

  it('decomposition with localPCA tangent basis reconstructs velocity', () => {
    // Points in xy-plane
    const neighbors = [
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
    ];
    const geo = localPCA(neighbors, 2);

    // A velocity with both tangent and normal components
    const velocity = [1, 1, 3];
    const { tangent, normal } = decompose(velocity, geo.tangentBasis);

    // Tangent should be in xy-plane, normal should be along z
    expect(Math.abs(tangent[2])).toBeLessThan(1e-6);
    expect(Math.abs(normal[0])).toBeLessThan(1e-6);
    expect(Math.abs(normal[1])).toBeLessThan(1e-6);
    expect(normal[2]).toBeCloseTo(3, 4);

    // Reconstruction
    const reconstructed = tangent.map((t, i) => t + normal[i]);
    expectVecClose(reconstructed, velocity, 1e-4);
  });

  it('handles higher-dimensional embeddings (simulating d=10)', () => {
    // 10D data with variance concentrated in first 3 dimensions
    const base = () => Array.from({ length: 10 }, () => 0);
    const neighbors: number[][] = [];
    for (let i = 0; i < 8; i++) {
      const v = base();
      v[0] = Math.cos(i * 0.8) * 5;
      v[1] = Math.sin(i * 0.8) * 3;
      v[2] = (i - 4) * 0.5;
      // Add tiny noise to other dimensions
      for (let j = 3; j < 10; j++) {
        v[j] = (Math.random() - 0.5) * 0.001;
      }
      neighbors.push(v);
    }

    const result = localPCA(neighbors, 3);
    expect(result.tangentBasis.length).toBe(3);
    expectOrthonormal(result.tangentBasis);
    expect(result.explainedVariance).toBeGreaterThan(0.95);
    expect(result.curvature).toBeLessThan(0.1);
  });

  it('eigenvalues are in descending order', () => {
    const neighbors = [
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
      [0.5, 0.5, 0.01],
    ];
    const result = localPCA(neighbors, 2);
    for (let i = 1; i < result.eigenvalues.length; i++) {
      expect(result.eigenvalues[i]).toBeLessThanOrEqual(result.eigenvalues[i - 1] + 1e-10);
    }
  });

  it('eigenvalues are non-negative', () => {
    const neighbors = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [2, 4, 6],
    ];
    const result = localPCA(neighbors);
    for (const ev of result.eigenvalues) {
      expect(ev).toBeGreaterThanOrEqual(0);
    }
  });

  it('centroid is the mean of neighbors', () => {
    const neighbors = [
      [2, 4, 6],
      [4, 6, 8],
      [6, 8, 10],
    ];
    const result = localPCA(neighbors, 1);
    expectVecClose(result.centroid, [4, 6, 8]);
  });
});
