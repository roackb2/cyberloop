import { describe, expect, it, vi } from 'vitest'

import { createControlBudget } from '@/core/budget/control-budget'
import type {
  Environment,
  Evaluator,
  Planner,
  Probe,
  ProbePolicy,
} from '@/core/interfaces'
import { ProportionalLadder } from '@/core/ladder/proportional'
import { Orchestrator } from '@/core/orchestrator'
import type { ProbeResult } from '@/core/types'

describe('Orchestrator - Comprehensive', () => {
  // Helper to create test fixtures
  const createTestFixtures = (overrides: {
    isStableAfter?: number
    shouldReplan?: boolean
    maxInnerSteps?: number
    innerBudget?: number
    outerBudget?: number
  } = {}) => {
    const {
      isStableAfter = 2,
      shouldReplan = false,
      maxInnerSteps = 10,
      innerBudget = 20,
      outerBudget = 6,
    } = overrides

    // Environment
    const apply = vi.fn(async (action: number) => action + 1)
    const observe = vi.fn(async () => 0)
    const env: Environment<number, number> = { apply, observe }

    // ProbePolicy
    let callCount = 0
    const decide = vi.fn(async () => 2)
    const isStable = vi.fn(() => {
      callCount++
      return callCount >= isStableAfter
    })
    const initialize = vi.fn()
    const adapt = vi.fn()
    const probePolicy: ProbePolicy<number, number, number> = {
      id: 'test-policy',
      capabilities: () => ({ cost: { step: 0.1 }, explorationRange: [0, 3], handles: [] }),
      decide,
      isStable,
      initialize,
      adapt,
    }

    // Planner
    const plan = vi.fn(async () => 0)
    const evaluatePlan = vi.fn(async () => 'Success!')
    const replan = vi.fn(async () => (shouldReplan ? 10 : null))
    const planner: Planner<number> = { plan, evaluate: evaluatePlan, replan }

    // Evaluator
    const evaluateFn = vi.fn(() => 0.75)
    const evaluator: Evaluator<number, number> = { evaluate: evaluateFn }

    // Ladder
    const ladder = new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 })

    // Probes
    const probeTest = vi.fn(async (): Promise<ProbeResult> => ({ pass: true }))
    const probe: Probe<number> = {
      id: 'test-probe',
      capabilities: () => ({ cost: 0 }),
      test: probeTest,
    }

    // Budget
    const budget = createControlBudget(innerBudget, outerBudget)

    return {
      env,
      probePolicy,
      planner,
      evaluator,
      ladder,
      probes: [probe],
      budget,
      maxInnerSteps,
      // Spies
      apply,
      decide,
      isStable,
      initialize,
      adapt,
      plan,
      evaluatePlan,
      replan,
      evaluateFn,
      probeTest,
    }
  }

  describe('Happy Path', () => {
    it('completes successfully when state becomes stable', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 2 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(result.output).toBe('Success!')
      expect(result.outerLoopCalls).toBe(2) // plan + evaluate
      expect(result.explorationAttempts).toBe(1)
      expect(fixtures.plan).toHaveBeenCalledWith('test input')
      expect(fixtures.evaluatePlan).toHaveBeenCalled()
      expect(fixtures.replan).not.toHaveBeenCalled()
    })

    it('runs inner loop multiple times before stabilizing', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 5 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(fixtures.isStable).toHaveBeenCalledTimes(5)
      expect(fixtures.decide).toHaveBeenCalled()
      expect(fixtures.apply).toHaveBeenCalled()
      expect(fixtures.evaluateFn).toHaveBeenCalled()
    })

    it('calls adapt on probe policy when available', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 2 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(fixtures.adapt).toHaveBeenCalled()
    })
  })

  describe('Budget Exhaustion', () => {
    it('stops when inner loop budget exhausted', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100, // Never stable
        innerBudget: 1, // Very low budget
        outerBudget: 10,
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(result.output).toContain('exhausted')
      expect(fixtures.budget.shouldStop()).toBe(true)
    })

    it('stops when outer loop budget exhausted', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100,
        innerBudget: 20,
        outerBudget: 2, // Only enough for plan call
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(result.output).toContain('exhausted')
    })

    it('stops when max inner steps reached', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100,
        maxInnerSteps: 3,
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(fixtures.isStable).toHaveBeenCalledTimes(3)
    })
  })

  describe('Replanning', () => {
    it('calls replan when inner loop exhausted and outer budget available', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100,
        shouldReplan: true,
        maxInnerSteps: 2,
        innerBudget: 5,
        outerBudget: 10,
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(fixtures.replan).toHaveBeenCalled()
      expect(fixtures.initialize).toHaveBeenCalled() // Called at least once after replan
    })

    it('does not replan when outer budget exhausted', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100,
        maxInnerSteps: 2,
        innerBudget: 5,
        outerBudget: 2, // Only enough for initial plan
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(fixtures.replan).not.toHaveBeenCalled()
    })

    it('stops when replan returns null', async () => {
      const fixtures = createTestFixtures({
        isStableAfter: 100,
        shouldReplan: false, // replan returns null
        maxInnerSteps: 2,
      })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(fixtures.replan).toHaveBeenCalled()
      expect(result.output).toContain('exhausted')
    })
  })

  describe('Logging and Observability', () => {
    it('creates step logs for each inner loop iteration', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 3 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      expect(orchestrator.logs.length).toBeGreaterThanOrEqual(3)
      expect(orchestrator.logs[0]).toHaveProperty('t')
      expect(orchestrator.logs[0]).toHaveProperty('state')
      expect(orchestrator.logs[0]).toHaveProperty('ladderLevel')
      expect(orchestrator.logs[0]).toHaveProperty('innerBudgetRemaining')
      expect(orchestrator.logs[0]).toHaveProperty('probeResult')
      expect(orchestrator.logs[0]).toHaveProperty('isStable')
    })

    it('includes action and feedback in logs after execution', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 2 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      const logWithAction = orchestrator.logs.find(log => log.action !== undefined)
      expect(logWithAction).toBeDefined()
      expect(logWithAction?.action).toBeDefined()
      expect(logWithAction?.next).toBeDefined()
      expect(logWithAction?.feedback).toBeDefined()
    })

    it('tracks exploration statistics', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 3 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(result.explorationAttempts).toBeGreaterThan(0)
      expect(result.innerLoopSteps).toBeGreaterThan(0)
      expect(result.outerLoopCalls).toBeGreaterThan(0)
    })
  })

  describe('Probe Integration', () => {
    it('runs all probes and aggregates results', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 2 })
      
      // Add multiple probes
      const probe2Test = vi.fn(async (): Promise<ProbeResult> => ({ pass: true }))
      const probe2: Probe<number> = {
        id: 'test-probe-2',
        test: probe2Test,
      }
      
      fixtures.probes.push(probe2)
      
      const orchestrator = new Orchestrator<number, number, number>(fixtures)
      await orchestrator.run('test input')

      expect(fixtures.probeTest).toHaveBeenCalled()
      expect(probe2Test).toHaveBeenCalled()
    })

    it('aggregates probe results correctly when all pass', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 1 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      await orchestrator.run('test input')

      const log = orchestrator.logs[0]
      expect(log.probeResult?.pass).toBe(true)
      expect(log.probeResult?.results).toHaveLength(1)
    })

    it('aggregates probe results correctly when some fail', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 1 })
      
      // Override probe to fail
      fixtures.probeTest.mockResolvedValue({ pass: false, reason: 'test-failure' })
      
      const orchestrator = new Orchestrator<number, number, number>(fixtures)
      await orchestrator.run('test input')

      const log = orchestrator.logs[0]
      expect(log.probeResult?.pass).toBe(false)
      expect(log.probeResult?.reason).toContain('test-failure')
    })
  })

  describe('Edge Cases', () => {
    it('handles immediate stability', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 1 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('test input')

      expect(result.output).toBe('Success!')
      expect(result.innerLoopSteps).toBe(1)
    })

    it('handles empty user input', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 1 })
      const orchestrator = new Orchestrator<number, number, number>(fixtures)

      const result = await orchestrator.run('')

      expect(fixtures.plan).toHaveBeenCalledWith('')
      expect(result.output).toBe('Success!')
    })

    it('initializes probe policy with initial state', async () => {
      const fixtures = createTestFixtures({ isStableAfter: 1 })
      fixtures.plan.mockResolvedValue(42)
      
      const orchestrator = new Orchestrator<number, number, number>(fixtures)
      await orchestrator.run('test input')

      expect(fixtures.initialize).toHaveBeenCalledWith(42)
    })
  })
})
