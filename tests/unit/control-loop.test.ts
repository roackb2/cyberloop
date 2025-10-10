import { describe, expect, it, vi } from 'vitest'

import type {
  Environment,
  Evaluator,
  Ladder,
  Policy,
} from '@/core/interfaces'
import { controlLoop } from '@/core/loop'

describe('controlLoop', () => {
  it('runs a single iteration and updates policy and ladder', async () => {
    const observe = vi.fn(async () => 1)
    const apply = vi.fn(async (action: number) => action + 1)
    const env: Environment<number, number> = { observe, apply }

    const decide = vi.fn(async () => 2)
    const adapt = vi.fn()
    const policy: Policy<number, number, number> = {
      id: 'test-policy',
      decide,
      adapt,
    }

    const evaluate = vi.fn(() => 0.5)
    const evaluator: Evaluator<number, number> = { evaluate }

    let ladderLevel = 0
    const update: Ladder<number>['update'] = vi.fn((feedback: number) => {
      ladderLevel = feedback
    })
    const ladder: Ladder<number> = {
      level: () => ladderLevel,
      update,
    }

    const result = await controlLoop(env, evaluator, policy, ladder)

    expect(result).toEqual({
      state: 1,
      action: 2,
      next: 3,
      feedback: 0.5,
    })
    expect(observe).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(2)
    expect(decide).toHaveBeenCalledWith(1, ladder)
    expect(adapt).toHaveBeenCalledWith(0.5, ladder)
    expect(update).toHaveBeenCalledWith(0.5)
    expect(ladder.level()).toBe(0.5)
  })

  it('reuses provided state without re-observing the environment', async () => {
    const observe = vi.fn(async () => 1)
    const apply = vi.fn(async (action: number) => action)
    const env: Environment<number, number> = { observe, apply }

    const policy: Policy<number, number, number> = {
      id: 'reuse-state',
      decide: async () => 5,
    }
    const evaluator: Evaluator<number, number> = {
      evaluate: () => 1,
    }
    const ladder: Ladder<number> = {
      level: () => 0,
      update: () => {
        // noop
      }
    }

    const result = await controlLoop(env, evaluator, policy, ladder, {
      state: 42,
    })

    expect(result.state).toBe(42)
    expect(observe).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith(5)
  })
})
