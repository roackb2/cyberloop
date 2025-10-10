import type { Environment } from '@/core/interfaces'

import type { GitHubSearchApi } from './search-tool'

export interface GhState {
  query: string
  hits: number
  entropy: number
  items?: { title: string; url: string; labels?: string[]; stars?: number }[]
  history?: { query: string; hits: number }[]
  probes?: { id: string; pass: boolean; reason?: string; data?: unknown }[]
}

export type GhAction =
  | { type: 'broaden'; payload?: { synonyms?: string[] } }
  | { type: 'narrow'; payload?: { exact?: string[] } }
  | { type: 'rephrase'; payload?: { pattern?: string } }

export const GitHubSearchEnv = (
  api: GitHubSearchApi,
  seedQuery: string,
  options: { initialFetch?: boolean; log?: boolean } = {},
): Environment<GhState, GhAction> => {
  let current: GhState = { query: seedQuery, hits: 0, entropy: 1, history: [], probes: [] }
  let initialized = false
  const initialFetch = options.initialFetch ?? true
  const log = options.log ?? false

  const fetch = async (query: string) => {
    const response = await api.search(query, { perPage: 10 })
    const history = (current.history ?? []).concat({ query, hits: response.hits }).slice(-10)
    // Preserve probe history across state transitions
    current = { query, ...response, history, probes: current.probes ?? [] }
    if (log) {
      console.log('[GitHubSearchEnv] fetch', {
        query,
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
        await fetch(current.query)
      }
      return current
    },
    apply: async (action) => {
      const nextQuery = mutateQuery(current.query, action)
      if (log) {
        console.log('[GitHubSearchEnv] apply', { action, nextQuery })
      }
      return fetch(nextQuery)
    },
  }
}

function mutateQuery(query: string, action: GhAction): string {
  switch (action.type) {
    case 'broaden':
      return sanitizeQuery(
        `${query} OR ${pickSynonym(action.payload?.synonyms)}`,
      )
    case 'narrow':
      return sanitizeQuery(applyNarrow(query, action.payload?.exact))
    case 'rephrase':
      return sanitizeQuery(
        `${query} ${action.payload?.pattern ?? 'best practices'}`,
      )
    default:
      return query
  }
}

function applyNarrow(query: string, phrases?: string[]): string {
  const exact = pickExact(phrases)
  if (!exact) return query
  if (query.includes(`"${exact}"`)) return query
  const base = query.split(/overrides/)[0]
  return `${base} "${exact}"`
}

function pickSynonym(synonyms?: string[]): string {
  if (synonyms?.length) return synonyms[Math.floor(Math.random() * synonyms.length)]
  return 'alternative'
}

function pickExact(exacts?: string[]): string {
  if (exacts?.length) return exacts[Math.floor(Math.random() * exacts.length)]
  return 'implementation'
}

function sanitizeQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
