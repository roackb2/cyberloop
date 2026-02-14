import { describe, expect, it } from 'vitest'

import { BlacklistGuard } from '@/core/policy/guards/blacklist'

interface TestState {
  links: string[]
  blacklist?: string[]
}

describe('BlacklistGuard', () => {
  const guard = new BlacklistGuard<TestState>()

  it('has correct name', () => {
    expect(guard.name).toBe('blacklist-guard')
  })

  it('returns state unchanged when no blacklist', () => {
    const state: TestState = { links: ['a', 'b', 'c'] }
    const result = guard.apply(state)

    expect(result.links).toEqual(['a', 'b', 'c'])
  })

  it('returns state unchanged when blacklist is empty', () => {
    const state: TestState = { links: ['a', 'b', 'c'], blacklist: [] }
    const result = guard.apply(state)

    expect(result.links).toEqual(['a', 'b', 'c'])
  })

  it('filters out blacklisted links', () => {
    const state: TestState = {
      links: ['a', 'b', 'c', 'd'],
      blacklist: ['b', 'd'],
    }
    const result = guard.apply(state)

    expect(result.links).toEqual(['a', 'c'])
  })

  it('handles blacklist with items not in links', () => {
    const state: TestState = {
      links: ['a', 'b'],
      blacklist: ['x', 'y'],
    }
    const result = guard.apply(state)

    expect(result.links).toEqual(['a', 'b'])
  })

  it('removes all links if all are blacklisted', () => {
    const state: TestState = {
      links: ['a', 'b'],
      blacklist: ['a', 'b'],
    }
    const result = guard.apply(state)

    expect(result.links).toEqual([])
  })

  it('does not mutate original state', () => {
    const state: TestState = {
      links: ['a', 'b', 'c'],
      blacklist: ['b'],
    }
    const result = guard.apply(state)

    expect(state.links).toEqual(['a', 'b', 'c'])
    expect(result.links).toEqual(['a', 'c'])
    expect(result).not.toBe(state)
  })

  it('handles empty links array', () => {
    const state: TestState = { links: [], blacklist: ['a'] }
    const result = guard.apply(state)

    expect(result.links).toEqual([])
  })
})
