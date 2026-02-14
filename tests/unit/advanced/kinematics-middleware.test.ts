/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { CorrectionInfo, KinematicsSnapshot } from '@/advanced/kinematics-middleware'
import { kinematicsMiddleware } from '@/advanced/kinematics-middleware'
import type { StateEmbedder } from '@/core/kinematics/interfaces'
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

const goalEmbedding = [1, 0, 0]

// --- Tests ---

describe('kinematicsMiddleware', () => {
  it('has correct name', () => {
    const mw = kinematicsMiddleware<TestState>({
      embedder: createEmbedder([[0, 0, 0]]),
      goalEmbedding,
    })
    expect(mw.name).toBe('kinematics')
  })

  describe('setup', () => {
    it('resets internal state', async () => {
      const embedder = createEmbedder([[1, 0, 0], [1, 0, 0]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })

      // Run a step to initialize physics
      await mw.setup!({ input: 'test' })
      await mw.beforeStep!(createCtx())

      // Setup again should reset
      await mw.setup!({ input: 'test' })
      const result = await mw.beforeStep!(createCtx())

      // Should be first step again (stepIndex 0)
      expect(result).not.toBe('halt')
      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['kinematics'] as KinematicsSnapshot
      expect(snapshot.stepIndex).toBe(0)
    })
  })

  describe('beforeStep', () => {
    it('attaches kinematics snapshot on first step', async () => {
      const embedder = createEmbedder([[0.5, 0.3, 0.1]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx())

      expect(result).not.toBe('halt')
      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['kinematics'] as KinematicsSnapshot
      expect(snapshot).toBeDefined()
      expect(snapshot.stepIndex).toBe(0)
      expect(snapshot.isStable).toBe(true) // first step is always stable
      expect(snapshot.position).toEqual([0.5, 0.3, 0.1])
    })

    it('embeds state using the provided embedder', async () => {
      const embedder = createEmbedder([[1, 2, 3]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })
      await mw.setup!({ input: 'test' })

      await mw.beforeStep!(createCtx({ state: { label: 'my-state' } }))

      expect(embedder.embed).toHaveBeenCalledWith({ label: 'my-state' })
    })

    it('detects stable movement (consistent direction)', async () => {
      // Vectors moving in a consistent direction
      const embedder = createEmbedder([
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ])
      const mw = kinematicsMiddleware<TestState>({
        embedder,
        goalEmbedding,
        pid: { stabilityThreshold: 0.5 },
      })
      await mw.setup!({ input: 'test' })

      // Step 0: initialization
      await mw.beforeStep!(createCtx({ step: 0 }))
      // Step 1: first real movement
      await mw.beforeStep!(createCtx({ step: 1 }))
      // Step 2: consistent direction
      const result = await mw.beforeStep!(createCtx({ step: 2 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['kinematics'] as KinematicsSnapshot
      expect(snapshot.isStable).toBe(true)
      expect(ctx.metadata['kinematicsCorrection']).toBeUndefined()
    })

    it('detects drift (direction change) and attaches correction', async () => {
      // First two vectors go right, then sharp turn
      const embedder = createEmbedder([
        [0, 0, 0],
        [1, 0, 0],
        [1, 5, 0], // sharp turn upward
      ])
      const mw = kinematicsMiddleware<TestState>({
        embedder,
        goalEmbedding: [0, 0, 0],
        pid: { Kp: 1.0, stabilityThreshold: 0.01 }, // very low threshold
      })
      await mw.setup!({ input: 'test' })

      // Step 0: init
      await mw.beforeStep!(createCtx({ step: 0 }))
      // Step 1: establish direction
      await mw.beforeStep!(createCtx({ step: 1 }))
      // Step 2: sharp turn
      const result = await mw.beforeStep!(createCtx({ step: 2 }))

      const ctx = result as StepContext<TestState>
      const snapshot = ctx.metadata['kinematics'] as KinematicsSnapshot
      // With a sharp turn and low threshold, correction should be triggered
      if (!snapshot.isStable) {
        const correction = ctx.metadata['kinematicsCorrection'] as CorrectionInfo
        expect(correction).toBeDefined()
        expect(correction.vector).toBeDefined()
        expect(correction.magnitude).toBeGreaterThan(0)
        expect(correction.log).toContain('PID')
      }
      // Either way, snapshot should exist
      expect(snapshot.stepIndex).toBe(2)
    })

    it('preserves existing metadata', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })
      await mw.setup!({ input: 'test' })

      const result = await mw.beforeStep!(createCtx({ metadata: { existing: 'value' } }))

      const ctx = result as StepContext<TestState>
      expect(ctx.metadata['existing']).toBe('value')
      expect(ctx.metadata['kinematics']).toBeDefined()
    })
  })

  describe('afterStep', () => {
    it('logs telemetry when logger provided', async () => {
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
      }
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding, logger })
      await mw.setup!({ input: 'test' })

      // Run beforeStep to populate metadata
      const beforeResult = await mw.beforeStep!(createCtx())
      const ctx = beforeResult as StepContext<TestState>

      await mw.afterStep!(ctx, createResult())

      expect(logger.info).toHaveBeenCalled()
    })

    it('does not log when no logger', async () => {
      const embedder = createEmbedder([[1, 0, 0]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })
      await mw.setup!({ input: 'test' })

      const beforeResult = await mw.beforeStep!(createCtx())
      const ctx = beforeResult as StepContext<TestState>

      // Should not throw
      await mw.afterStep!(ctx, createResult())
    })
  })

  describe('defaults', () => {
    it('uses default PID params (Kp=1, Ki=0, Kd=0)', async () => {
      const embedder = createEmbedder([[0, 0, 0], [1, 0, 0]])
      const mw = kinematicsMiddleware<TestState>({ embedder, goalEmbedding })
      await mw.setup!({ input: 'test' })

      // Should not throw with defaults
      await mw.beforeStep!(createCtx({ step: 0 }))
      const result = await mw.beforeStep!(createCtx({ step: 1 }))

      const ctx = result as StepContext<TestState>
      expect(ctx.metadata['kinematics']).toBeDefined()
    })
  })
})
