import { describe, expect, it, vi } from 'vitest'

import {
  SimpleBudgetTracker,
} from '@/core/defaults'
import type {
  Environment,
  Evaluator,
  Ladder,
  Policy,
  Probe,
  StrategySelector,
} from '@/core/interfaces'
import {
  Orchestrator,
} from '@/core/orchestrator'

describe('Orchestrator', () => {
  it('records feedback and respects the control kernel integration', async () => {
    const observe = vi.fn(async () => 0)
    const apply = vi.fn(async (action: number) => action + 1)
    const env: Environment<number, number> = { observe, apply }

    const decide = vi.fn(async () => 2)
    const adapt = vi.fn()
    const policy: Policy<number, number, number> = {
      id: 'policy',
      capabilities: () => ({ cost: { step: 2 }, explorationRange: [0, 3] }),
      decide,
      adapt,
    }

    const evaluate = vi.fn(() => 0.75)
    const evaluator: Evaluator<number, number> = { evaluate }

    let ladderLevel = 0
    const update: Ladder<number>['update'] = vi.fn((feedback: number) => {
      ladderLevel = feedback
    })
    const ladder: Ladder<number> = {
      level: () => ladderLevel,
      update,
    }

    const probeTest = vi.fn(async () => ({ pass: true }))
    const probe: Probe<number> = {
      id: 'probe',
      capabilities: () => ({ cost: 0 }),
      test: probeTest,
    }

    const select = vi.fn(() => ({ probe, policy }))
    const selector: StrategySelector<number, number> = { select }

    const budget = new SimpleBudgetTracker(10)

    const orchestrator = new Orchestrator<number, number, number>({
      env,
      evaluator,
      ladder,
      budget,
      selector,
      probes: [probe],
      policies: [policy],
      maxSteps: 1,
    })

    const { logs, final } = await orchestrator.run()

    expect(select).toHaveBeenCalledTimes(1)
    expect(probeTest).toHaveBeenCalledWith(0)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(2)
    expect(decide).toHaveBeenCalledWith(0, ladder)
    expect(adapt).toHaveBeenCalledWith(0.75, ladder)
    expect(update).toHaveBeenCalledWith(0.75)
    expect(ladder.level()).toBeCloseTo(0.75)
    expect(budget.remaining()).toBe(8)

    expect(logs).toHaveLength(1)
    const [first] = logs
    expect(first.feedback).toBe(0.75)
    expect(first.score).toBe(0.75)
    expect(first.action).toBe(2)
    expect(first.next).toBe(3)
    expect(first.state).toBe(0)
    expect(first.ladderLevel).toBeCloseTo(0.75)
    expect(first.budgetRemaining).toBe(8)
    expect(final).toBe(3)
  })
})
