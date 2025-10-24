import { describe, expect, it } from 'vitest'

import type { GhState } from '@/adapters/github/env'
import { QueryMutatePolicy } from '@/adapters/github/policy'
import type { Ladder } from '@/core/interfaces'

describe('QueryMutatePolicy', () => {
  const createMockLadder = (level: number): Ladder<number> => ({
    level: () => level,
    update: () => { /* no-op */ },
  })

  const createState = (overrides: Partial<GhState> = {}): GhState => ({
    query: 'test',
    filters: { keywords: ['test'] },
    hits: 42,
    entropy: 0.5,
    history: [],
    probes: [],
    ...overrides,
  })

  describe('Metadata', () => {
    it('has correct id', () => {
      expect(QueryMutatePolicy.id).toBe('query-mutate')
    })

    it('has correct capabilities', () => {
      const caps = QueryMutatePolicy.capabilities?.()

      expect(caps?.explorationRange).toEqual([0, 3])
      expect(caps?.cost).toEqual({ step: 1 })
      expect(caps?.handles).toContain('Unknown')
      expect(caps?.handles).toContain('NoData')
      expect(caps?.handles).toContain('TooBroad')
      expect(caps?.handles).toContain('TooNarrow')
    })

    it('handles all common failure modes', () => {
      const caps = QueryMutatePolicy.capabilities?.()

      expect(caps?.handles).toHaveLength(4)
    })
  })

  describe('Decision Logic: No Hits', () => {
    it('broadens when hits = 0', async () => {
      const state = createState({ hits: 0 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      expect(action.payload).toBeUndefined()
    })

    it('broadens when hits = 0 regardless of entropy', async () => {
      const state = createState({ hits: 0, entropy: 0.1 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
    })

    it('broadens when hits = 0 regardless of level', async () => {
      const state = createState({ hits: 0 })
      const ladder = createMockLadder(3)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
    })
  })

  describe('Decision Logic: High Entropy', () => {
    it('narrows when entropy > 0.8 and level < 1.5', async () => {
      const state = createState({ hits: 100, entropy: 0.85 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('narrows at entropy boundary (0.8)', async () => {
      const state = createState({ hits: 100, entropy: 0.81 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('does not narrow when entropy = 0.8 exactly', async () => {
      const state = createState({ hits: 100, entropy: 0.8 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).not.toBe('narrow')
    })

    it('narrows at level boundary (1.5)', async () => {
      const state = createState({ hits: 100, entropy: 0.85 })
      const ladder = createMockLadder(1.4)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('does not narrow when level >= 1.5', async () => {
      const state = createState({ hits: 100, entropy: 0.85 })
      const ladder = createMockLadder(1.5)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).not.toBe('narrow')
    })

    it('does not narrow when level > 1.5', async () => {
      const state = createState({ hits: 100, entropy: 0.85 })
      const ladder = createMockLadder(2)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).not.toBe('narrow')
    })
  })

  describe('Decision Logic: High Level', () => {
    it('broadens with synonyms when level > 2', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(2.1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      if (action.type === 'broaden') {
        expect(action.payload?.synonyms).toEqual(['guide', 'tutorial', 'best practices'])
      }
    })

    it('broadens with synonyms at level = 3', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(3)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      if (action.type === 'broaden') {
        expect(action.payload?.synonyms).toBeDefined()
      }
    })

    it('does not broaden with synonyms when level = 2', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(2)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).not.toBe('broaden')
    })
  })

  describe('Decision Logic: Default (Rephrase)', () => {
    it('rephrases when conditions not met', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
      if (action.type === 'rephrase') {
        expect(action.payload?.pattern).toBe('techniques')
      }
    })

    it('rephrases with low entropy and low level', async () => {
      const state = createState({ hits: 50, entropy: 0.3 })
      const ladder = createMockLadder(0.5)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('rephrases with moderate entropy and moderate level', async () => {
      const state = createState({ hits: 50, entropy: 0.6 })
      const ladder = createMockLadder(1.8)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })
  })

  describe('Decision Priority', () => {
    it('prioritizes no-hits over high entropy', async () => {
      const state = createState({ hits: 0, entropy: 0.9 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      expect(action.payload).toBeUndefined() // No synonyms
    })

    it('prioritizes no-hits over high level', async () => {
      const state = createState({ hits: 0, entropy: 0.5 })
      const ladder = createMockLadder(3)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      expect(action.payload).toBeUndefined() // No synonyms
    })

    it('prioritizes high entropy over high level', async () => {
      const state = createState({ hits: 100, entropy: 0.9 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('checks high level before default rephrase', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(2.5)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      if (action.type === 'broaden') {
        expect(action.payload?.synonyms).toBeDefined()
      }
    })
  })

  describe('Edge Cases', () => {
    it('handles level = 0', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(0)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('handles very high level', async () => {
      const state = createState({ hits: 50, entropy: 0.5 })
      const ladder = createMockLadder(10)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      if (action.type === 'broaden') {
        expect(action.payload?.synonyms).toBeDefined()
      }
    })

    it('handles entropy = 1', async () => {
      const state = createState({ hits: 50, entropy: 1 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('handles entropy = 0', async () => {
      const state = createState({ hits: 50, entropy: 0 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('handles very large hit count', async () => {
      const state = createState({ hits: 1000000, entropy: 0.5 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('handles hits = 1', async () => {
      const state = createState({ hits: 1, entropy: 0.5 })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })
  })

  describe('Real-World Scenarios', () => {
    it('handles initial search with no results', async () => {
      const state = createState({ hits: 0, entropy: 1 })
      const ladder = createMockLadder(0)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
    })

    it('handles too many scattered results', async () => {
      const state = createState({ hits: 500, entropy: 0.95 })
      const ladder = createMockLadder(0.5)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('narrow')
    })

    it('handles good results at low level', async () => {
      const state = createState({ hits: 20, entropy: 0.4 })
      const ladder = createMockLadder(0.5)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('handles stuck at high level', async () => {
      const state = createState({ hits: 30, entropy: 0.6 })
      const ladder = createMockLadder(2.8)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('broaden')
      if (action.type === 'broaden') {
        expect(action.payload?.synonyms).toContain('guide')
      }
    })

    it('handles borderline entropy at mid level', async () => {
      const state = createState({ hits: 50, entropy: 0.79 })
      const ladder = createMockLadder(1.2)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })
  })

  describe('State Independence', () => {
    it('decision depends only on hits, entropy, and level', async () => {
      const state1 = createState({
        hits: 50,
        entropy: 0.5,
        query: 'different query',
        filters: { keywords: ['completely', 'different'] },
      })
      const state2 = createState({
        hits: 50,
        entropy: 0.5,
        query: 'another query',
        filters: { keywords: ['other', 'keywords'] },
      })
      const ladder = createMockLadder(1)

      const action1 = await QueryMutatePolicy.decide(state1, ladder)
      const action2 = await QueryMutatePolicy.decide(state2, ladder)

      expect(action1).toEqual(action2)
    })

    it('ignores history', async () => {
      const state = createState({
        hits: 50,
        entropy: 0.5,
        history: [
          { filters: { keywords: ['old'] }, hits: 100 },
          { filters: { keywords: ['previous'] }, hits: 0 },
        ],
      })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })

    it('ignores probes', async () => {
      const state = createState({
        hits: 50,
        entropy: 0.5,
        probes: [
          { id: 'test-probe', pass: false, reason: 'failed' },
        ],
      })
      const ladder = createMockLadder(1)

      const action = await QueryMutatePolicy.decide(state, ladder)

      expect(action.type).toBe('rephrase')
    })
  })
})
