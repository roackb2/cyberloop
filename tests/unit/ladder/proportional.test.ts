import { describe, expect, it } from 'vitest'

import { ProportionalLadder } from '@/core/ladder/proportional'

describe('ProportionalLadder', () => {
  it('increases level on positive feedback', () => {
    const ladder = new ProportionalLadder({ gainUp: 1, max: 3 })
    expect(ladder.level()).toBe(0)
    ladder.update(0.5)
    expect(ladder.level()).toBe(0.5)
  })

  it('decreases level on negative feedback with gainDown', () => {
    const ladder = new ProportionalLadder({ gainDown: 0.25 })
    ladder.update(1)
    expect(ladder.level()).toBeGreaterThan(0)
    const prev = ladder.level()
    ladder.update(-1)
    expect(ladder.level()).toBeLessThan(prev)
  })

  it('respects the max bound', () => {
    const ladder = new ProportionalLadder({ gainUp: 2, max: 1 })
    ladder.update(1)
    ladder.update(1)
    expect(ladder.level()).toBe(1)
  })
})
