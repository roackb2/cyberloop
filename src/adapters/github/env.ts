import type { Environment } from '@/core/interfaces'

import type { GitHubSearchApi, SearchFilters } from './search-tool'

export interface GhState {
  query: string // Legacy - for display
  filters: SearchFilters
  hits: number
  entropy: number
  items?: { title: string; url: string; labels?: string[]; stars?: number }[]
  history?: { filters: SearchFilters; hits: number }[]
  probes?: { id: string; pass: boolean; reason?: string; data?: unknown }[]
}

export type GhAction =
  | { type: 'broaden'; payload?: { synonyms?: string[] } }
  | { type: 'narrow'; payload?: { exact?: string[] } }
  | { type: 'rephrase'; payload?: { pattern?: string } }

export const GitHubSearchEnv = (
  api: GitHubSearchApi,
  initialFilters: SearchFilters,
  options: { initialFetch?: boolean; log?: boolean } = {},
): Environment<GhState, GhAction> => {
  let current: GhState = {
    query: initialFilters.keywords.join(' '),
    filters: initialFilters,
    hits: 0,
    entropy: 1,
    history: [],
    probes: []
  }
  let initialized = false
  const initialFetch = options.initialFetch ?? true
  const log = options.log ?? false

  if (initialFetch) {
    void (async () => {
      const result = await api.search(initialFilters)
      current = {
        ...current,
        history: [...(current.history ?? []), { filters: initialFilters, hits: result.hits }],
        probes: current.probes ?? [],
        hits: result.hits,
        entropy: result.entropy,
        items: result.items,
      }
      initialized = true
    })()
  }
  const fetch = async (filters: SearchFilters) => {
    const response = await api.search(filters, { perPage: 10 })
    const history = (current.history ?? []).concat({ filters, hits: response.hits }).slice(-10)
    // Preserve probe history across state transitions
    current = { 
      query: filters.keywords.join(' '),
      filters,
      ...response, 
      history, 
      probes: current.probes ?? [] 
    }
    if (log) {
      console.log('[GitHubSearchEnv] fetch', {
        query: current.query,
        hits: current.hits,
        entropy: current.entropy,
        probes: current.probes?.length ?? 0,
      })
    }
    initialized = true
    return current
  }

  return {
    observe: async () => {
      if (!initialized && initialFetch) {
        await fetch(current.filters)
      }
      return current
    },
    apply: async (action) => {
      const nextFilters = mutateFilters(current.filters, action)
      if (log) {
        console.log('[GitHubSearchEnv] apply', { action, nextFilters })
      }
      return fetch(nextFilters)
    },
  }
}

function mutateFilters(filters: SearchFilters, action: GhAction): SearchFilters {
  switch (action.type) {
    case 'broaden':
      // Handle special broadening directives
      if (action.payload?.synonyms) {
        const synonym = action.payload.synonyms[0]
        // Check if it's a stars directive to remove minStars
        if (synonym === 'stars:>0') {
          return {
            ...filters,
            minStars: undefined,
          }
        }
        // Otherwise add as OR keywords
        return {
          ...filters,
          orKeywords: action.payload.synonyms,
        }
      }
      // Remove last keyword if no payload
      if (filters.keywords.length > 1) {
        return {
          ...filters,
          keywords: filters.keywords.slice(0, -1),
        }
      }
      return filters
    case 'narrow':
      // Handle special narrowing directives
      if (action.payload?.exact) {
        const exact = action.payload.exact[0]
        // Check if it's a stars directive
        if (exact?.startsWith('stars:>')) {
          const minStars = parseInt(exact.replace('stars:>', ''), 10)
          return {
            ...filters,
            minStars,
          }
        }
        // Otherwise add as keyword
        return {
          ...filters,
          keywords: [...filters.keywords, ...action.payload.exact],
        }
      }
      return filters
    case 'rephrase':
      // Keep same filters (no-op)
      return filters
    default:
      return filters
  }
}
