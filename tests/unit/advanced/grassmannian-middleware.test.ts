import { describe, expect, it, vi } from 'vitest';

import { grassmannianMiddleware } from '../../../src/advanced/grassmannian-middleware';
import type { SubspaceBasis } from '../../../src/core/geometry/grassmannian';
import type { GrassmannianSnapshot, SubspaceTrajectory } from '../../../src/core/kinematics/interfaces';
import type { StepContext } from '../../../src/core/middleware/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a standard basis vector e_i in ℝ^d */
function basisVector(d: number, i: number): number[] {
  const v = new Array<number>(d).fill(0);
  v[i] = 1;
  return v;
}

/** Create a mock embedder that returns vectors from a sequence */
function createSequentialEmbedder(vectors: number[][]) {
  let idx = 0;
  return {
    embed: vi.fn(() => {
      const v = vectors[idx % vectors.length];
      idx++;
      return Promise.resolve(v);
    }),
  };
}

/** Create a mock embedder that always returns the same vector */
function createStaticEmbedder(vector: number[]) {
  return {
    embed: vi.fn(() => Promise.resolve([...vector])),
  };
}

/** Create a basic StepContext */
function createCtx<S>(step: number, state: S): StepContext<S> {
  return {
    step,
    state,
    budget: { used: step, remaining: 20 - step },
    metadata: {},
  };
}

/** Create a simple SubspaceTrajectory that returns the same basis at every step */
function createStaticTrajectory(basis: SubspaceBasis): SubspaceTrajectory {
  return {
    referenceAt: () => basis,
    length: 100,
  };
}

/** Create a SubspaceTrajectory that returns different bases per step */
function createIndexedTrajectory(bases: SubspaceBasis[]): SubspaceTrajectory {
  return {
    referenceAt: (t: number) => bases[Math.min(t, bases.length - 1)],
    length: bases.length,
  };
}

// ─── Basic behavior ──────────────────────────────────────────────────────────

describe('grassmannianMiddleware', () => {
  describe('sliding window and subspace extraction', () => {
    it('returns degenerate snapshot on first step (window size 1)', async () => {
      const embedder = createStaticEmbedder([1, 0, 0]);
      const mw = grassmannianMiddleware({ embedder });
      await mw.setup!({ input: 'test' });

      const result = await mw.beforeStep!(createCtx(0, 'state'));
      expect(result).not.toBe('halt');
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.currentBasis).toEqual([]);
      expect(snap.subspaceDim).toBe(0);
      expect(snap.windowSize).toBe(1);
      expect(snap.isDrifting).toBe(false);
    });

    it('extracts subspace after accumulating enough vectors', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);
      const mw = grassmannianMiddleware({ embedder, subspaceDim: 2 });
      await mw.setup!({ input: 'test' });

      // Step 0: only 1 vector → degenerate
      await mw.beforeStep!(createCtx(0, 'state'));

      // Step 1: 2 vectors → can extract
      const result = await mw.beforeStep!(createCtx(1, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.subspaceDim).toBeGreaterThan(0);
      expect(snap.currentBasis.length).toBeGreaterThan(0);
      expect(snap.windowSize).toBe(2);
    });

    it('maintains sliding window of configured size', async () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
      ];
      const embedder = createSequentialEmbedder(vectors);
      const mw = grassmannianMiddleware({ embedder, windowSize: 3 });
      await mw.setup!({ input: 'test' });

      // Run 5 steps
      for (let i = 0; i < 5; i++) {
        await mw.beforeStep!(createCtx(i, 'state'));
      }

      // After 5 steps with windowSize=3, window should contain last 3 vectors
      const result = await mw.beforeStep!(createCtx(5, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;
      // Window should be capped at 3 (windowSize) even though we've seen 6 vectors
      expect(snap.windowSize).toBeLessThanOrEqual(3);
    });

    it('resets window on setup', async () => {
      const embedder = createStaticEmbedder([1, 0, 0]);
      const mw = grassmannianMiddleware({ embedder });

      // Run some steps
      await mw.setup!({ input: 'test' });
      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));

      // Reset
      await mw.setup!({ input: 'test2' });

      // First step after reset should be degenerate (window size 1)
      const result = await mw.beforeStep!(createCtx(0, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;
      expect(snap.subspaceDim).toBe(0);
    });
  });

  // ─── Reference trajectory comparison ────────────────────────────────────

  describe('reference trajectory comparison', () => {
    it('computes geodesic distance to reference when trajectory is provided', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      // Reference: subspace in the z-w plane (orthogonal to data)
      const refBasis: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
      });
      await mw.setup!({ input: 'test' });

      // Accumulate enough vectors
      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      // Data is in xy-plane, reference is in zw-plane → large distance
      expect(snap.geodesicDistance).toBeGreaterThan(1.0);
      expect(snap.principalAngles.length).toBeGreaterThan(0);
      expect(snap.maxAngle).toBeGreaterThan(0);
    });

    it('returns small distance when data aligns with reference', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [-1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      // Reference: subspace in the x-y plane (same as data)
      const refBasis: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
      });
      await mw.setup!({ input: 'test' });

      for (let i = 0; i < 4; i++) {
        await mw.beforeStep!(createCtx(i, 'state'));
      }

      const result = await mw.beforeStep!(createCtx(4, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      // Data is in xy-plane, reference is in xy-plane → small distance
      expect(snap.geodesicDistance).toBeLessThan(0.5);
    });

    it('uses step index to query trajectory', async () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const basis0: SubspaceBasis = [basisVector(3, 0)];
      const basis1: SubspaceBasis = [basisVector(3, 1)];
      const trajectory = createIndexedTrajectory([basis0, basis1, basis1]);

      const referenceAtSpy = vi.spyOn(trajectory, 'referenceAt');

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 1,
        trajectory,
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      await mw.beforeStep!(createCtx(2, 'state'));

      // Should have been called with step indices
      expect(referenceAtSpy).toHaveBeenCalledWith(1);
      expect(referenceAtSpy).toHaveBeenCalledWith(2);
    });

    it('computes steering direction when enabled', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const refBasis: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        computeSteering: true,
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.steeringDirection).not.toBeNull();
      expect(snap.steeringDirection!.length).toBeGreaterThan(0);
    });

    it('does not compute steering when disabled', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const refBasis: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        computeSteering: false,
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.steeringDirection).toBeNull();
    });

    it('works without trajectory (observation only)', async () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const mw = grassmannianMiddleware({ embedder, subspaceDim: 2 });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      // Should still extract subspace
      expect(snap.subspaceDim).toBeGreaterThan(0);
      // But no comparison data
      expect(snap.geodesicDistance).toBe(0);
      expect(snap.principalAngles).toEqual([]);
      expect(snap.steeringDirection).toBeNull();
      expect(snap.isDrifting).toBe(false);
    });
  });

  // ─── Drift detection ───────────────────────────────────────────────────

  describe('drift detection', () => {
    it('sets isDrifting when geodesic distance exceeds threshold', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      // Reference: orthogonal subspace → large distance
      const refBasis: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        driftThreshold: 0.5,
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.isDrifting).toBe(true);
    });

    it('does not set isDrifting when distance is below threshold', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
        [-1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      // Reference: same subspace → small distance
      const refBasis: SubspaceBasis = [basisVector(4, 0), basisVector(4, 1)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        driftThreshold: 2.0,
      });
      await mw.setup!({ input: 'test' });

      for (let i = 0; i < 4; i++) {
        await mw.beforeStep!(createCtx(i, 'state'));
      }

      const result = await mw.beforeStep!(createCtx(4, 'state'));
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;

      expect(snap.isDrifting).toBe(false);
    });

    it('halts when driftAction is halt and drift detected', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const refBasis: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        driftThreshold: 0.5,
        driftAction: 'halt',
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));

      expect(result).toBe('halt');
    });

    it('warns (does not halt) when driftAction is warn', async () => {
      const vectors = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [1, 1, 0, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);

      const refBasis: SubspaceBasis = [basisVector(4, 2), basisVector(4, 3)];
      const trajectory = createStaticTrajectory(refBasis);

      const mw = grassmannianMiddleware({
        embedder,
        subspaceDim: 2,
        trajectory,
        driftThreshold: 0.5,
        driftAction: 'warn',
      });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      await mw.beforeStep!(createCtx(1, 'state'));
      const result = await mw.beforeStep!(createCtx(2, 'state'));

      expect(result).not.toBe('halt');
      const ctx = result as StepContext<string>;
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;
      expect(snap.isDrifting).toBe(true);
    });
  });

  // ─── Logger ─────────────────────────────────────────────────────────────

  describe('logging', () => {
    it('calls logger when provided', async () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);
      const logger = {
        trace: vi.fn(), debug: vi.fn(), info: vi.fn(),
        warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
      };

      const mw = grassmannianMiddleware({ embedder, logger });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      // First step is degenerate, logger may or may not be called
      // Second step should have enough data
      await mw.beforeStep!(createCtx(1, 'state'));

      expect(logger.info).toHaveBeenCalled();
    });
  });

  // ─── Middleware protocol ────────────────────────────────────────────────

  describe('middleware protocol', () => {
    it('has name "grassmannian"', () => {
      const embedder = createStaticEmbedder([1, 0, 0]);
      const mw = grassmannianMiddleware({ embedder });
      expect(mw.name).toBe('grassmannian');
    });

    it('afterStep resolves without error', async () => {
      const embedder = createStaticEmbedder([1, 0, 0]);
      const mw = grassmannianMiddleware({ embedder });
      await expect(
        mw.afterStep!(createCtx(0, 'state'), { state: 'state' }),
      ).resolves.toBeUndefined();
    });

    it('writes to metadata.grassmannian channel', async () => {
      const vectors = [
        [1, 0, 0],
        [0, 1, 0],
      ];
      const embedder = createSequentialEmbedder(vectors);
      const mw = grassmannianMiddleware({ embedder });
      await mw.setup!({ input: 'test' });

      await mw.beforeStep!(createCtx(0, 'state'));
      const result = await mw.beforeStep!(createCtx(1, 'state'));
      const ctx = result as StepContext<string>;

      expect(ctx.metadata.grassmannian).toBeDefined();
      const snap = ctx.metadata.grassmannian as GrassmannianSnapshot;
      expect(snap).toHaveProperty('currentBasis');
      expect(snap).toHaveProperty('geodesicDistance');
      expect(snap).toHaveProperty('principalAngles');
      expect(snap).toHaveProperty('explainedVariance');
      expect(snap).toHaveProperty('windowSize');
      expect(snap).toHaveProperty('subspaceDim');
      expect(snap).toHaveProperty('isDrifting');
      expect(snap).toHaveProperty('steeringDirection');
    });
  });
});
