/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Ladder, Logger, ProbePolicy } from '@/core/interfaces'
import { PhysicsEngine } from '@/core/kinematics/engine'
import type { KinematicsConfig, StateEmbedder } from '@/core/kinematics/interfaces'
import { PIDController } from '@/core/kinematics/pid'
import { KinematicProbePolicy } from '@/core/kinematics/policy'

// --- Test Helpers ---

interface TestState { value: string }
interface TestAction { type: string; title?: string; vector?: number[]; magnitude?: number; log?: string }
type TestFeedback = number

const createMockInnerPolicy = (
  overrides: Partial<ProbePolicy<TestState, TestAction, TestFeedback>> = {}
): ProbePolicy<TestState, TestAction, TestFeedback> => ({
  id: 'mock-inner',
  decide: vi.fn(() => Promise.resolve({ type: 'NAVIGATE', title: 'next' })),
  isStable: vi.fn(() => false),
  initialize: vi.fn(),
  adapt: vi.fn(),
  ...overrides,
})

const createMockEmbedder = (embeddings: number[][]): StateEmbedder<TestState> => {
  let callIndex = 0
  return {
    embed: vi.fn(() => {
      const result = embeddings[Math.min(callIndex, embeddings.length - 1)]
      callIndex++
      return Promise.resolve(result)
    }),
  }
}

const createMockLadder = (level = 0): Ladder<TestFeedback> => ({
  level: () => level,
  update: () => { /* no-op */ },
})

const defaultConfig: KinematicsConfig = {
  ProcessNoise: 0.1,
  MeasureNoise: 0.1,
  PID: { Kp: 1, Ki: 0, Kd: 0 },
  MaxDeviation: 0.5,
}

const createState = (value: string): TestState => ({ value } as TestState)

// --- Tests ---

describe('KinematicProbePolicy', () => {
  describe('Construction', () => {
    it('has correct id', () => {
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder([[0, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)

      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      expect(policy.id).toBe('kinematic-policy')
    })
  })

  describe('initialize', () => {
    it('delegates to inner policy', () => {
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder([[0, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      const state = createState('initial')
      policy.initialize(state)

      expect(inner.initialize).toHaveBeenCalledWith(state)
    })

    it('resets PID controller', () => {
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder([[0, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)
      const resetSpy = vi.spyOn(pid, 'reset')
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      policy.initialize(createState('initial'))

      expect(resetSpy).toHaveBeenCalled()
    })
  })

  describe('isStable', () => {
    it('delegates to inner policy', () => {
      const inner = createMockInnerPolicy({ isStable: vi.fn(() => true) })
      const embedder = createMockEmbedder([[0, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      const state = createState('test')
      expect(policy.isStable(state)).toBe(true)
      expect(inner.isStable).toHaveBeenCalledWith(state)
    })
  })

  describe('decide — first step', () => {
    it('delegates to inner policy on first call (no correction possible)', async () => {
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder([[1, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      policy.initialize(createState('initial'))
      const action = await policy.decide(createState('step1'), createMockLadder())

      expect(action).toEqual({ type: 'NAVIGATE', title: 'next' })
      expect(inner.decide).toHaveBeenCalled()
    })
  })

  describe('decide — stable movement', () => {
    it('delegates to inner policy when PID correction is small (stable)', async () => {
      // Move along same direction → small error → stable
      const embeddings = [
        [1, 0, 0],   // step 1 (origin)
        [2, 0, 0],   // step 2 (same direction)
      ]
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder(embeddings)
      const engine = new PhysicsEngine(defaultConfig)
      // High stability threshold so small corrections are stable
      const pid = new PIDController(1, 0, 0, 10)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      policy.initialize(createState('initial'))
      await policy.decide(createState('step1'), createMockLadder()) // sets origin
      const action = await policy.decide(createState('step2'), createMockLadder())

      expect(action).toEqual({ type: 'NAVIGATE', title: 'next' })
    })
  })

  describe('decide — correction triggered', () => {
    it('returns CORRECTION action when PID detects instability', async () => {
      // Move along X, then suddenly jump to Y → large cross-track error
      const embeddings = [
        [1, 0, 0],    // step 1 (origin)
        [2, 0, 0],    // step 2 (along X)
        [2, 10, 0],   // step 3 (sudden Y jump → whiplash)
      ]
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder(embeddings)
      const engine = new PhysicsEngine(defaultConfig)
      // Very low stability threshold so large corrections trigger
      const pid = new PIDController(1, 0, 0, 0.001)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      policy.initialize(createState('initial'))
      await policy.decide(createState('step1'), createMockLadder()) // sets origin
      await policy.decide(createState('step2'), createMockLadder()) // establishes heading
      const action = await policy.decide(createState('step3'), createMockLadder())

      expect(action).toHaveProperty('type', 'CORRECTION')
      expect(action).toHaveProperty('vector')
      expect(action).toHaveProperty('magnitude')
      expect(action).toHaveProperty('log')
    })
  })

  describe('adapt', () => {
    it('delegates to inner policy', () => {
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder([[0, 0, 0]])
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)
      const ladder = createMockLadder()

      policy.adapt(0.5 as TestFeedback, ladder)

      expect(inner.adapt).toHaveBeenCalledWith(0.5, ladder)
    })
  })

  describe('Logger integration', () => {
    it('logs kinematics data when logger is provided', async () => {
      const embeddings = [
        [1, 0, 0],
        [2, 0, 0],
      ]
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder(embeddings)
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0, 10)
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
      }
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid, mockLogger)

      policy.initialize(createState('initial'))
      await policy.decide(createState('step1'), createMockLadder())
      await policy.decide(createState('step2'), createMockLadder())

      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('does not crash when no logger provided', async () => {
      const embeddings = [
        [1, 0, 0],
        [2, 0, 0],
      ]
      const inner = createMockInnerPolicy()
      const embedder = createMockEmbedder(embeddings)
      const engine = new PhysicsEngine(defaultConfig)
      const pid = new PIDController(1, 0, 0, 10)
      const policy = new KinematicProbePolicy(inner, embedder, engine, pid)

      policy.initialize(createState('initial'))
      await policy.decide(createState('step1'), createMockLadder())

      await expect(policy.decide(createState('step2'), createMockLadder())).resolves.toBeDefined()
    })
  })
})
