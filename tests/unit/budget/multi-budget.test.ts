import { describe, expect, it } from 'vitest'

import { MultiBudget } from '@/core/budget/multi'

describe('MultiBudget', () => {
  it('tracks multiple caps and remaining ratios', () => {
    const budget = new MultiBudget({ steps: 10, tokens: 100 })
    expect(budget.remaining()).toBe(1)
    budget.record(2)
    expect(budget.remaining()).toBeCloseTo(0.8)
    budget.record({ tokens: 40 })
    expect(budget.remaining()).toBeCloseTo(0.6)
    expect(budget.shouldStop()).toBe(false)
    budget.record({ steps: 8, tokens: 60 })
    expect(budget.shouldStop()).toBe(true)
  })

  it('resets usage when requested', () => {
    const budget = new MultiBudget({ steps: 5 })
    budget.record(5)
    expect(budget.shouldStop()).toBe(true)
    budget.reset()
    expect(budget.shouldStop()).toBe(false)
  })
})
