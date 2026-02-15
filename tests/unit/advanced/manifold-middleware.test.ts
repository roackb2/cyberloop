/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import { manifoldMiddleware } from '@/advanced/manifold-middleware'
import type { ManifoldProvider, ManifoldSnapshot, StateEmbedder } from '@/core/kinematics/interfaces'
import type { StepContext, StepResult } from '@/core/middleware/types'

// --- Helpers ---

interface TestState {
  label: string
}

const createCtx = (overrides: Partial<StepContext<TestState>> = {}): StepContext<TestState> => ({
  step: 0,
  state: { label: 'test' },
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

const createResult = (): StepResult<TestState> => ({ state: { label: 'next' } })

/**
 * Creates a mock embedder that returns the given vectors in sequence.
 */
const createEmbedder = (vectors: number[][]): StateEmbedder<TestState> => {
  let call = 0
  return {
    embed: vi.fn(() => {
      const v = vectors[call % vectors.length]
      call++
      return Promise.resolve(v)
    }),
  }
}

/**
 * Creates a mock ManifoldProvider that returns fixed neighbors for any query.
 */
const createManifold = (neighbors: number[][]): ManifoldProvider => ({
  knn: vi.fn(() => Promise.resolve(neighbors)),
})

// Neighbors forming a clear xy-plane (for predictable tangent/normal decomposition)
const xyPlaneNeighbors = [
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [0, -1, 0],
  [0.5, 0.5, 0],
  [-0.5, -0.5, 0],
]

// --- Tests ---

describe('manifoldMiddleware', () => {
  it('has correct name', () => {
    const mw = manifoldMiddleware<TestState>({
      embedder: createEmbedder([[0, 0, 0]]),
      manifold: createManifold(xyPlaneNeighbors),
    })
    expect(mw.name).toBe('manifold')
  })

  describe('setup', () => {
    it('resets internal state', async () => {
      const embedder = createEmbedder([[1, 0, 0], [2, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
      })

      // Run a step
      await mw.setup!({ input: 'test' })
      await mw.beforeStep!(createCtx({ step: 0 }))

      // Setup again should reset (no previous embedding for velocity fallback)
      await mw.setup!({ input: 'test' })
      const result = await mw.beforeStep!(createCtx({ step: 0 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot
      expect(snapshot).toBeDefined()
    })
  })

  describe('beforeStep', () => {
    it('attaches manifold snapshot on first step', async () => {
      const embedder = createEmbedder([[0.5, 0.3, 0.1]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx())

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot
      expect(snapshot).toBeDefined()
      expect(snapshot.curvature).toBeGreaterThanOrEqual(0)
      expect(snapshot.curvature).toBeLessThanOrEqual(1)
      expect(snapshot.explainedVariance).toBeGreaterThanOrEqual(0)
      expect(snapshot.explainedVariance).toBeLessThanOrEqual(1)
      expect(snapshot.neighborCount).toBe(xyPlaneNeighbors.length)
    })

    it('embeds state using the provided embedder', async () => {
      const embedder = createEmbedder([[1, 2, 3]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      await mw.beforeStep!(createCtx({ state: { label: 'my-state' } }))

      expect(embedder.embed).toHaveBeenCalledWith({ label: 'my-state' })
    })

    it('queries ManifoldProvider with correct k', async () => {
      const manifold = createManifold(xyPlaneNeighbors)
      const mw = manifoldMiddleware<TestState>({
        embedder: createEmbedder([[1, 0, 0]]),
        manifold,
        k: 25,
      })
      await mw.setup!({ input: 'test' })

      await mw.beforeStep!(createCtx())

      expect(manifold.knn).toHaveBeenCalledWith([1, 0, 0], 25)
    })

    it('decomposes velocity into tangent and normal components', async () => {
      // Two steps: first at origin, second moving along z-axis (off the xy-plane manifold)
      const embedder = createEmbedder([
        [0, 0, 0],
        [0, 0, 1], // movement purely in z → should be entirely normal to xy-plane
      ])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
        topK: 2,
      })
      await mw.setup!({ input: 'test' })

      // Step 0: initialize
      await mw.beforeStep!(createCtx({ step: 0 }))
      // Step 1: movement in z
      const result = await mw.beforeStep!(createCtx({ step: 1 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot

      // Velocity is [0,0,1] (raw fallback since no kinematics middleware)
      // Tangent should be ~[0,0,0] (z has no component in xy-plane)
      // Normal should be ~[0,0,1]
      expect(snapshot.normalDriftMagnitude).toBeGreaterThan(0.5)
      expect(Math.abs(snapshot.velocityNormal[2])).toBeGreaterThan(0.5)
    })

    it('uses EKF-filtered velocity from kinematics metadata when available', async () => {
      const embedder = createEmbedder([[0, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
        topK: 2,
      })
      await mw.setup!({ input: 'test' })

      // Simulate kinematics middleware having already written metadata
      const kinematicsVelocity = [0, 0, 2] // purely off-manifold
      const ctx = createCtx({
        metadata: {
          kinematics: {
            position: [0, 0, 0],
            velocity: kinematicsVelocity,
            error: [0, 0, 0],
            errorMagnitude: 0,
            correctionMagnitude: 0,
            coherenceAngleDeg: 0,
            isStable: true,
            stepIndex: 1,
          },
        },
      })

      const result = await mw.beforeStep!(ctx)

      const resultCtx = result as StepContext<TestState>
      const snapshot = resultCtx.metadata['manifold'] as ManifoldSnapshot

      // Should use the kinematics velocity [0,0,2], which is entirely normal to xy-plane
      expect(snapshot.normalDriftMagnitude).toBeGreaterThan(1)
    })

    it('falls back to raw velocity when kinematics metadata absent', async () => {
      const embedder = createEmbedder([
        [1, 0, 0],
        [1, 0, 1], // move in z
      ])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
        topK: 2,
      })
      await mw.setup!({ input: 'test' })

      // Step 0
      await mw.beforeStep!(createCtx({ step: 0 }))
      // Step 1 — no kinematics in metadata
      const result = await mw.beforeStep!(createCtx({ step: 1 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot

      // Raw velocity = [0,0,1], entirely normal to xy-plane
      expect(snapshot.normalDriftMagnitude).toBeGreaterThan(0.5)
    })

    it('returns zero velocity on first step with no kinematics', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
        topK: 2,
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx({ step: 0 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot

      // First step, no previous embedding → zero velocity
      expect(snapshot.normalDriftMagnitude).toBeCloseTo(0)
    })

    it('handles degenerate case with fewer than 2 neighbors', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold([[1, 0.1, 0]]), // only 1 neighbor
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx())

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot
      expect(snapshot).toBeDefined()
      expect(snapshot.curvature).toBe(1) // maximally uncertain
      expect(snapshot.explainedVariance).toBe(0)
      expect(snapshot.neighborCount).toBe(1)
    })

    it('handles empty neighbors', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold([]), // no neighbors
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx())

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot
      expect(snapshot).toBeDefined()
      expect(snapshot.neighborCount).toBe(0)
    })

    it('preserves existing metadata', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx({ metadata: { existing: 'value' } }))

      const ctx = result as StepContext<TestState>
      expect(ctx.metadata['existing']).toBe('value')
      expect(ctx.metadata['manifold']).toBeDefined()
    })

    it('reports distance to centroid', async () => {
      // Embedding far from the neighborhood centroid
      const embedder = createEmbedder([[10, 10, 10]])
      const mw = manifoldMiddleware<TestState>({
        embedder,
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx())

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['manifold'] as ManifoldSnapshot
      expect(snapshot.distanceToCentroid).toBeGreaterThan(10)
    })
  })

  describe('afterStep', () => {
    it('does not throw', async () => {
      const mw = manifoldMiddleware<TestState>({
        embedder: createEmbedder([[1, 0, 0]]),
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      const beforeResult = await mw.beforeStep!(createCtx())
      const ctx = beforeResult as StepContext<TestState>

      // Should not throw
      await mw.afterStep!(ctx, createResult())
    })
  })

  describe('logging', () => {
    it('logs telemetry when logger provided', async () => {
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
      }
      const mw = manifoldMiddleware<TestState>({
        embedder: createEmbedder([[1, 0, 0]]),
        manifold: createManifold(xyPlaneNeighbors),
        logger,
      })
      await mw.setup!({ input: 'test' })

      await mw.beforeStep!(createCtx())

      expect(logger.info).toHaveBeenCalled()
      const logCall = logger.info.mock.calls[0]
      expect(logCall[0]).toHaveProperty('manifold')
      expect(logCall[1]).toContain('[Manifold]')
    })

    it('does not log when no logger', async () => {
      const mw = manifoldMiddleware<TestState>({
        embedder: createEmbedder([[1, 0, 0]]),
        manifold: createManifold(xyPlaneNeighbors),
      })
      await mw.setup!({ input: 'test' })

      // Should not throw
      await mw.beforeStep!(createCtx())
    })
  })

  describe('defaults', () => {
    it('uses default k=50', async () => {
      const manifold = createManifold(xyPlaneNeighbors)
      const mw = manifoldMiddleware<TestState>({
        embedder: createEmbedder([[1, 0, 0]]),
        manifold,
      })
      await mw.setup!({ input: 'test' })

      await mw.beforeStep!(createCtx())

      expect(manifold.knn).toHaveBeenCalledWith([1, 0, 0], 50)
    })
  })
})
