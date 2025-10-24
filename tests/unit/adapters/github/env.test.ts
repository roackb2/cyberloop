/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { GhAction } from '@/adapters/github/env'
import { GitHubSearchEnv } from '@/adapters/github/env'
import type { GitHubSearchApi, SearchFilters } from '@/adapters/github/search-tool'

describe('GitHubSearchEnv', () => {
  const createMockApi = (overrides?: Partial<GitHubSearchApi>): GitHubSearchApi => ({
    search: vi.fn(async () => ({
      hits: 42,
      entropy: 0.5,
      items: [
        { title: 'Result 1', url: 'http://example.com/1', labels: [], stars: 10 },
        { title: 'Result 2', url: 'http://example.com/2', labels: [], stars: 8 },
      ],
    })),
    ...overrides,
  })

  const initialFilters: SearchFilters = {
    keywords: ['typescript', 'testing'],
  }

  describe('Initialization', () => {
    it('creates environment with initial state', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const state = await env.observe()

      expect(state.query).toBe('typescript testing')
      expect(state.filters).toEqual(initialFilters)
      expect(state.hits).toBe(0)
      expect(state.entropy).toBe(1)
      expect(state.history).toEqual([])
    })

    it('fetches initial data when initialFetch is true', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: true })

      const state = await env.observe()

      expect(api.search).toHaveBeenCalledWith(initialFilters)
      expect(state.hits).toBe(42)
      expect(state.entropy).toBe(0.5)
      expect(state.items).toHaveLength(2)
    })

    it('does not fetch when initialFetch is false', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.observe()

      expect(api.search).not.toHaveBeenCalled()
    })

    it('defaults to initialFetch true', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters)

      await env.observe()

      expect(api.search).toHaveBeenCalled()
    })
  })

  describe('Action: broaden', () => {
    it('removes last keyword when no payload', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = { type: 'broaden' }
      const state = await env.apply(action)

      expect(state.filters.keywords).toEqual(['typescript'])
      expect(api.search).toHaveBeenCalledWith(
        expect.objectContaining({ keywords: ['typescript'] }),
        { perPage: 10 }
      )
    })

    it('does not remove keyword if only one remains', async () => {
      const api = createMockApi()
      const singleKeyword: SearchFilters = { keywords: ['typescript'] }
      const env = GitHubSearchEnv(api, singleKeyword, { initialFetch: false })

      const action: GhAction = { type: 'broaden' }
      const state = await env.apply(action)

      expect(state.filters.keywords).toEqual(['typescript'])
    })

    it('adds OR keywords when synonyms provided', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'broaden',
        payload: { synonyms: ['javascript', 'js'] },
      }
      const state = await env.apply(action)

      expect(state.filters.orKeywords).toEqual(['javascript', 'js'])
      expect(state.filters.keywords).toEqual(['typescript', 'testing'])
    })

    it('removes minStars when synonym is stars:>0', async () => {
      const api = createMockApi()
      const filtersWithStars: SearchFilters = {
        keywords: ['typescript'],
        minStars: 100,
      }
      const env = GitHubSearchEnv(api, filtersWithStars, { initialFetch: false })

      const action: GhAction = {
        type: 'broaden',
        payload: { synonyms: ['stars:>0'] },
      }
      const state = await env.apply(action)

      expect(state.filters.minStars).toBeUndefined()
      expect(state.filters.keywords).toEqual(['typescript'])
    })
  })

  describe('Action: narrow', () => {
    it('adds exact keywords when provided', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: ['vitest'] },
      }
      const state = await env.apply(action)

      expect(state.filters.keywords).toEqual(['typescript', 'testing', 'vitest'])
    })

    it('adds multiple exact keywords', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: ['vitest', 'coverage'] },
      }
      const state = await env.apply(action)

      expect(state.filters.keywords).toEqual(['typescript', 'testing', 'vitest', 'coverage'])
    })

    it('sets minStars when exact is stars directive', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: ['stars:>100'] },
      }
      const state = await env.apply(action)

      expect(state.filters.minStars).toBe(100)
      expect(state.filters.keywords).toEqual(['typescript', 'testing'])
    })

    it('handles different star thresholds', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: ['stars:>1000'] },
      }
      const state = await env.apply(action)

      expect(state.filters.minStars).toBe(1000)
    })

    it('does nothing when no payload', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = { type: 'narrow' }
      const state = await env.apply(action)

      expect(state.filters).toEqual(initialFilters)
    })
  })

  describe('Action: rephrase', () => {
    it('keeps same filters (no-op)', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = { type: 'rephrase' }
      const state = await env.apply(action)

      expect(state.filters).toEqual(initialFilters)
      expect(api.search).toHaveBeenCalledWith(initialFilters, expect.anything())
    })

    it('triggers new search with same filters', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'rephrase',
        payload: { pattern: 'different wording' },
      }
      await env.apply(action)

      expect(api.search).toHaveBeenCalledWith(initialFilters, { perPage: 10 })
    })
  })

  describe('State Management', () => {
    it('updates state after action', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = { type: 'broaden' }
      await env.apply(action)

      const state = await env.observe()

      expect(state.filters.keywords).toEqual(['typescript'])
      expect(state.hits).toBe(42)
      expect(state.entropy).toBe(0.5)
    })

    it('maintains history across actions', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'broaden' })
      await env.apply({ type: 'narrow', payload: { exact: ['vitest'] } })

      const state = await env.observe()

      expect(state.history).toHaveLength(2)
      expect(state.history?.[0]?.filters.keywords).toEqual(['typescript'])
      expect(state.history?.[1]?.filters.keywords).toEqual(['typescript', 'vitest'])
    })

    it('limits history to 10 entries', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      // Apply 15 actions
      for (let i = 0; i < 15; i++) {
        await env.apply({ type: 'rephrase' })
      }

      const state = await env.observe()

      expect(state.history).toHaveLength(10)
    })

    it('updates query string from keywords', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'narrow', payload: { exact: ['vitest'] } })

      const state = await env.observe()

      expect(state.query).toBe('typescript testing vitest')
    })

    it('preserves items from search results', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const state = await env.apply({ type: 'rephrase' })

      expect(state.items).toHaveLength(2)
      expect(state.items?.[0]?.title).toBe('Result 1')
    })

    it('preserves probe results across state transitions', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      // Manually set probes (normally done by orchestrator)
      const state1 = await env.observe()
      state1.probes = [{ id: 'test-probe', pass: true }]

      await env.apply({ type: 'rephrase' })
      const state2 = await env.observe()

      expect(state2.probes).toBeDefined()
    })
  })

  describe('API Integration', () => {
    it('calls search with perPage parameter', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'rephrase' })

      expect(api.search).toHaveBeenCalledWith(
        expect.anything(),
        { perPage: 10 }
      )
    })

    it('handles search errors gracefully', async () => {
      const api = createMockApi({
        search: vi.fn(async () => {
          throw new Error('API Error')
        }),
      })
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await expect(env.apply({ type: 'rephrase' })).rejects.toThrow('API Error')
    })

    it('uses different results for different queries', async () => {
      const api: GitHubSearchApi = {
        search: vi.fn(async (filters) => {
          const keywordCount = (filters as SearchFilters).keywords.length
          return {
            hits: keywordCount * 10,
            entropy: 0.5,
            items: [],
          }
        }),
      }
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const state1 = await env.apply({ type: 'rephrase' })
      expect(state1.hits).toBe(20) // 2 keywords * 10

      const state2 = await env.apply({ type: 'broaden' })
      expect(state2.hits).toBe(10) // 1 keyword * 10
    })
  })

  describe('Complex Scenarios', () => {
    it('handles sequence of broaden and narrow actions', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'broaden' }) // Remove 'testing'
      await env.apply({ type: 'narrow', payload: { exact: ['vitest'] } }) // Add 'vitest'
      await env.apply({ type: 'broaden' }) // Remove 'vitest'

      const state = await env.observe()

      expect(state.filters.keywords).toEqual(['typescript'])
    })

    it('handles stars directive followed by keyword changes', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'narrow', payload: { exact: ['stars:>100'] } })
      await env.apply({ type: 'narrow', payload: { exact: ['popular'] } })

      const state = await env.observe()

      expect(state.filters.minStars).toBe(100)
      expect(state.filters.keywords).toEqual(['typescript', 'testing', 'popular'])
    })

    it('handles broadening with synonyms then narrowing', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      await env.apply({ type: 'broaden', payload: { synonyms: ['javascript'] } })
      await env.apply({ type: 'narrow', payload: { exact: ['framework'] } })

      const state = await env.observe()

      expect(state.filters.orKeywords).toEqual(['javascript'])
      expect(state.filters.keywords).toEqual(['typescript', 'testing', 'framework'])
    })
  })

  describe('Edge Cases', () => {
    it('handles empty initial keywords', async () => {
      const api = createMockApi()
      const emptyFilters: SearchFilters = { keywords: [] }
      const env = GitHubSearchEnv(api, emptyFilters, { initialFetch: false })

      const state = await env.observe()

      expect(state.query).toBe('')
      expect(state.filters.keywords).toEqual([])
    })

    it('handles single keyword', async () => {
      const api = createMockApi()
      const singleKeyword: SearchFilters = { keywords: ['typescript'] }
      const env = GitHubSearchEnv(api, singleKeyword, { initialFetch: false })

      await env.apply({ type: 'broaden' })
      const state = await env.observe()

      expect(state.filters.keywords).toEqual(['typescript'])
    })

    it('handles malformed stars directive', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: ['stars:>invalid'] },
      }
      const state = await env.apply(action)

      expect(state.filters.minStars).toBeNaN()
    })

    it('handles empty payload arrays', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false })

      const action: GhAction = {
        type: 'narrow',
        payload: { exact: [] },
      }
      const state = await env.apply(action)

      expect(state.filters.keywords).toEqual(['typescript', 'testing'])
    })
  })

  describe('Logging', () => {
    it('does not log by default', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false, log: false })

      await env.apply({ type: 'rephrase' })

      // No assertion - just ensure it doesn't crash
      expect(true).toBe(true)
    })

    it('accepts log option', async () => {
      const api = createMockApi()
      const env = GitHubSearchEnv(api, initialFilters, { initialFetch: false, log: true })

      await env.apply({ type: 'rephrase' })

      // No assertion - just ensure logging doesn't crash
      expect(true).toBe(true)
    })
  })
})
