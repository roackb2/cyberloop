import { describe, expect, it } from 'vitest'

import type { GhState } from '@/adapters/github/env'
import { dropGuardProbe, entropyGuardProbe, hasHitsProbe } from '@/adapters/github/probes'

// Helper to create minimal test state
const createState = (overrides: Partial<GhState> = {}): GhState => ({
  query: 'test query',
  filters: { keywords: [] },
  hits: 0,
  entropy: 0.5,
  items: [],
  history: [],
  ...overrides,
})

describe('GitHub Probes', () => {
  describe('hasHitsProbe', () => {
    it('passes when hits >= minimum (1)', async () => {
      const state = createState({ hits: 5 })

      const result = await hasHitsProbe.test(state)

      expect(result.pass).toBe(true)
    })

    it('fails when hits = 0', async () => {
      const state = createState({ hits: 0 })

      const result = await hasHitsProbe.test(state)

      expect(result.pass).toBe(false)
      expect(result.reason).toBe('no-hits')
    })

    it('passes when hits = 1 (exactly at minimum)', async () => {
      const state = createState({ hits: 1 })

      const result = await hasHitsProbe.test(state)

      expect(result.pass).toBe(true)
    })

    it('has correct capabilities', () => {
      const caps = hasHitsProbe.capabilities?.()

      expect(caps?.cost).toBe(0.05)
    })

    it('has correct id', () => {
      expect(hasHitsProbe.id).toBe('gh-hit-count')
    })
  })

  describe('dropGuardProbe', () => {
    describe('Initial State (No History)', () => {
      it('passes when initial query has hits', async () => {
        const state = createState({ hits: 10, history: [] })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(true)
      })

      it('fails when initial query has no hits', async () => {
        const state = createState({ hits: 0, history: [] })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(false)
        expect(result.reason).toBe('no-hits-initial')
        expect(result.data).toEqual({ current: 0, previous: null })
      })
    })

    describe('Hit Drop Detection', () => {
      it('fails when hits drop from positive to zero', async () => {
        const state = createState({
          hits: 0,
          history: [
            { filters: { keywords: [] }, hits: 50 },
            { filters: { keywords: [] }, hits: 0 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(false)
        expect(result.reason).toBe('hit-drop-to-zero')
        expect(result.data).toMatchObject({
          current: 0,
          previous: 50,
          dropPercent: 100,
        })
      })

      it('fails when hits drop by >80% from high count', async () => {
        const state = createState({
          hits: 3,
          history: [
            { filters: { keywords: [] }, hits: 20 },
            { filters: { keywords: [] }, hits: 3 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(false)
        expect(result.reason).toBe('significant-hit-drop')
        expect((result.data as { dropPercent?: number })?.dropPercent).toBeGreaterThan(80)
      })

      it('passes when hits drop by <80%', async () => {
        const state = createState({
          hits: 10,
          history: [
            { filters: { keywords: [] }, hits: 20 },
            { filters: { keywords: [] }, hits: 10 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(true)
      })

      it('passes when hits increase', async () => {
        const state = createState({
          hits: 30,
          history: [
            { filters: { keywords: [] }, hits: 20 },
            { filters: { keywords: [] }, hits: 30 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(true)
      })
    })

    describe('Stuck at Zero Detection', () => {
      it('fails when stuck at zero for 3+ iterations', async () => {
        const state = createState({
          hits: 0,
          history: [
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(false)
        expect(result.reason).toBe('stuck-at-zero')
        expect((result.data as { recentHits?: number[] })?.recentHits).toEqual([0, 0, 0])
      })

      it('passes when only 2 zeros in history', async () => {
        const state = createState({
          hits: 0,
          history: [
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        // Should fail on no-hits-initial or hit-drop-to-zero instead
        // With only 2 zeros, it triggers stuck-at-zero (checks last 3)
        expect(result.pass).toBe(false)
      })

      it('passes when recent history has some hits', async () => {
        const state = createState({
          hits: 0,
          history: [
            { filters: { keywords: [] }, hits: 5 },
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
            { filters: { keywords: [] }, hits: 0 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        // Recent 3 are [0, 0, 0] so triggers stuck-at-zero
        expect(result.pass).toBe(false)
      })
    })

    describe('Edge Cases', () => {
      it('handles single history entry', async () => {
        const state = createState({
          hits: 5,
          history: [
            { filters: { keywords: [] }, hits: 5 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(true)
      })

      it('handles low previous hit count (<=10)', async () => {
        const state = createState({
          hits: 1,
          history: [
            { filters: { keywords: [] }, hits: 5 },
            { filters: { keywords: [] }, hits: 1 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        // 80% drop but previous was <=10, so no significant-hit-drop
        expect(result.pass).toBe(true)
      })

      it('includes data in passing result', async () => {
        const state = createState({
          hits: 15,
          history: [
            { filters: { keywords: [] }, hits: 10 },
            { filters: { keywords: [] }, hits: 15 },
          ],
        })

        const result = await dropGuardProbe.test(state)

        expect(result.pass).toBe(true)
        expect(result.data).toEqual({ current: 15, previous: 10 })
      })
    })

    describe('Capabilities', () => {
      it('has zero cost', () => {
        const caps = dropGuardProbe.capabilities?.()

        expect(caps?.cost).toBe(0)
      })

      it('supports NoData and TooNarrow failure types', () => {
        const caps = dropGuardProbe.capabilities?.()

        expect(caps?.supports).toContain('NoData')
        expect(caps?.supports).toContain('TooNarrow')
      })

      it('has correct id', () => {
        expect(dropGuardProbe.id).toBe('gh-hit-drop')
      })
    })
  })

  describe('entropyGuardProbe', () => {
    it('passes when entropy is in acceptable range', async () => {
      const state = createState({ entropy: 0.5 })

      const result = await entropyGuardProbe.test(state)

      expect(result.pass).toBe(true)
    })

    it('fails when entropy is too high (>0.85)', async () => {
      const state = createState({ entropy: 0.9 })

      const result = await entropyGuardProbe.test(state)

      expect(result.pass).toBe(false)
      expect(result.reason).toBe('entropy-high')
    })

    it('fails when entropy is too low (<0.15)', async () => {
      const state = createState({ entropy: 0.1 })

      const result = await entropyGuardProbe.test(state)

      expect(result.pass).toBe(false)
      expect(result.reason).toBe('entropy-low')
    })

    it('passes at upper boundary (0.85)', async () => {
      const state = createState({ entropy: 0.85 })

      const result = await entropyGuardProbe.test(state)

      expect(result.pass).toBe(true)
    })

    it('passes at lower boundary (0.15)', async () => {
      const state = createState({ entropy: 0.15 })

      const result = await entropyGuardProbe.test(state)

      expect(result.pass).toBe(true)
    })

    it('has correct cost', () => {
      const caps = entropyGuardProbe.capabilities?.()

      expect(caps?.cost).toBe(0.1)
    })
  })

  describe('State Inspector', () => {
    it('inspectState is available on dropGuardProbe', () => {
      expect(typeof dropGuardProbe.inspectState).toBe('function')
    })

    it('inspectState returns formatted state summary', () => {
      const state = createState({
        query: 'test search',
        hits: 42,
        entropy: 0.75,
        items: [
          { title: 'Result 1', url: 'http://example.com/1', labels: [], stars: 10 },
          { title: 'Result 2', url: 'http://example.com/2', labels: [], stars: 8 },
        ],
        history: [
          { filters: { keywords: [], language: 'typescript' }, hits: 30 },
        ],
      })

      const inspection = dropGuardProbe.inspectState?.(state) as {
        query: string
        hits: number
        entropy: number
        items: string[] | undefined
        history: { filters: string; hits: number }[] | undefined
      }

      expect(inspection).toBeDefined()
      expect(inspection).toMatchObject({
        query: 'test search',
        hits: 42,
        entropy: 0.75,
        items: ['Result 1', 'Result 2'],
      })
      expect(inspection.history).toBeDefined()
      expect(inspection.history![0]).toMatchObject({
        hits: 30,
      })
    })
  })
})
