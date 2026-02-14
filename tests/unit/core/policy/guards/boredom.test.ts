import { describe, expect, it } from 'vitest'

import { BoredomGuard } from '@/core/policy/guards/boredom'

interface TestState {
  history: string[]
  links: string[]
  candidateWeights?: Record<string, number>
}

describe('BoredomGuard', () => {
  const guard = new BoredomGuard<TestState>()

  it('has correct name', () => {
    expect(guard.name).toBe('boredom-guard')
  })

  it('returns state unchanged when history is empty', () => {
    const state: TestState = { history: [], links: ['Link A', 'Link B'] }
    const result = guard.apply(state)

    expect(result).toBe(state) // Same reference — no modification
  })

  it('returns state unchanged when no history words appear > 2 times', () => {
    const state: TestState = {
      history: ['Alpha', 'Beta'],
      links: ['Gamma', 'Delta'],
    }
    const result = guard.apply(state)

    expect(result).toBe(state)
  })

  it('penalizes links with words appearing > 2 times in history', () => {
    const state: TestState = {
      // "computer" appears 3 times in history (> 2 threshold)
      history: ['Computer Science', 'Computer Engineering', 'Computer Architecture'],
      links: ['Computer Networks', 'Biology'],
    }
    const result = guard.apply(state)

    expect(result.candidateWeights).toBeDefined()
    // "Computer Networks" should be penalized
    expect(result.candidateWeights!['Computer Networks']).toBeLessThan(1.0)
    // "Biology" should not have a weight entry (no penalty)
    expect(result.candidateWeights!['Biology']).toBeUndefined()
  })

  it('filters stop words (the, of, in, etc.)', () => {
    const state: TestState = {
      // "the" appears many times but is a stop word
      history: ['The Cat', 'The Dog', 'The Bird', 'The Fish'],
      links: ['The Whale'],
    }
    const result = guard.apply(state)

    // "the" is a stop word, so no penalty should be applied
    expect(result).toBe(state)
  })

  it('filters short words (length <= 2)', () => {
    const state: TestState = {
      history: ['AI ML', 'AI ML', 'AI ML', 'AI ML'],
      links: ['AI Research'],
    }
    const result = guard.apply(state)

    // "ai" and "ml" are 2 chars, filtered out
    expect(result).toBe(state)
  })

  it('penalty multiplier is clamped to minimum 0.1', () => {
    const state: TestState = {
      // "quantum" appears 20 times — very high penalty
      history: Array.from({ length: 20 }, () => 'Quantum Physics'),
      links: ['Quantum Computing'],
    }
    const result = guard.apply(state)

    expect(result.candidateWeights).toBeDefined()
    // Weight should be clamped at 0.1 minimum
    expect(result.candidateWeights!['Quantum Computing']).toBeGreaterThanOrEqual(0.1)
  })

  it('preserves existing candidateWeights and applies penalty multiplicatively', () => {
    const state: TestState = {
      history: ['Neural Networks', 'Neural Pathways', 'Neural Architecture'],
      links: ['Neural Computing'],
      candidateWeights: { 'Neural Computing': 0.5 },
    }
    const result = guard.apply(state)

    expect(result.candidateWeights).toBeDefined()
    // Should be 0.5 * penaltyMultiplier (< 0.5)
    expect(result.candidateWeights!['Neural Computing']).toBeLessThan(0.5)
  })

  it('does not mutate original state', () => {
    const state: TestState = {
      history: ['Computer Science', 'Computer Engineering', 'Computer Architecture'],
      links: ['Computer Networks'],
    }
    const originalLinks = [...state.links]
    guard.apply(state)

    expect(state.links).toEqual(originalLinks)
    expect(state.candidateWeights).toBeUndefined()
  })

  it('handles links with no overlapping words', () => {
    const state: TestState = {
      history: ['Alpha Beta', 'Alpha Beta', 'Alpha Beta'],
      links: ['Gamma Delta'],
    }
    const result = guard.apply(state)

    expect(result).toBe(state)
  })

  it('removes punctuation during tokenization', () => {
    const state: TestState = {
      // "computer" appears 4 times despite punctuation (> 2 threshold)
      // After tokenization: "computer" from each entry
      history: ['Computer!', 'Computer.', 'Computer,', 'Computer;'],
      links: ['Computer Science'],
    }
    const result = guard.apply(state)

    expect(result.candidateWeights).toBeDefined()
    expect(result.candidateWeights!['Computer Science']).toBeDefined()
  })
})
