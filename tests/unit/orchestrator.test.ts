import { describe, expect, it, vi } from 'vitest'

import { createControlBudget } from '@/core/budget/control-budget'
import { ProportionalLadder } from '@/core/defaults'
import type {
  Environment,
  Evaluator,
  Planner,
  Probe,
  ProbePolicy,
} from '@/core/interfaces'
import {
  Orchestrator,
} from '@/core/orchestrator'

describe('Orchestrator', () => {
  it('runs inner/outer loop with probe policy and planner', async () => {
    // Environment
    const apply = vi.fn(async (action: number) => action + 1)
    const observe = vi.fn(async () => 0) // Not used in new architecture but required by interface
    const env: Environment<number, number> = { apply, observe }

    // ProbePolicy
    let callCount = 0
    const decide = vi.fn(async () => 2)
    const isStable = vi.fn(() => {
      callCount++
      return callCount > 1 // Stable after second call
    })
    const initialize = vi.fn()
    const probePolicy: ProbePolicy<number, number, number> = {
      id: 'test-policy',
      capabilities: () => ({ cost: { step: 0.1 }, explorationRange: [0, 3], handles: [] }),
      decide,
      isStable,
      initialize,
    }

    // Planner
    const plan = vi.fn(async () => 0) // Initial state
    const evaluatePlan = vi.fn(async () => 'Success!')
    const replan = vi.fn(async () => null)
    const planner: Planner<number> = { plan, evaluate: evaluatePlan, replan }

    // Evaluator
    const evaluateFn = vi.fn(() => 0.75)
    const evaluator: Evaluator<number, number> = { evaluate: evaluateFn }

    // Ladder
    const ladder = new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 })

    // Probes
    const probeTest = vi.fn(async () => ({ pass: true }))
    const probe: Probe<number> = {
      id: 'test-probe',
      capabilities: () => ({ cost: 0 }),
      test: probeTest,
    }

    // Budget
    const budget = createControlBudget(20, 6)

    const orchestrator = new Orchestrator<number, number, number>({
      env,
      probePolicy,
      planner,
      probes: [probe],
      evaluator,
      ladder,
      budget,
      maxInnerSteps: 5,
    })

    const result = await orchestrator.run('test input')

    // Verify outer loop calls
    expect(plan).toHaveBeenCalledWith('test input')
    expect(initialize).toHaveBeenCalledWith(0)
    expect(evaluatePlan).toHaveBeenCalled()
    
    // Verify inner loop
    expect(probeTest).toHaveBeenCalled()
    expect(decide).toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith(2)
    expect(isStable).toHaveBeenCalled()
    
    // Verify result
    expect(result.output).toBe('Success!')
    expect(result.outerLoopCalls).toBe(2) // plan + evaluate
    expect(result.logs.length).toBeGreaterThan(0)
  })
})
