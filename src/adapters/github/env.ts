import type { Environment } from '@/core/interfaces'

import type { GitHubSearchApi } from './search-tool'

export interface GhState {
  query: string
  hits: number
  entropy: number
  items?: { title: string; url: string; labels?: string[]; stars?: number }[]
}

export type GhAction =
  | { type: 'broaden'; payload?: { synonyms?: string[] } }
  | { type: 'narrow'; payload?: { exact?: string[] } }
  | { type: 'rephrase'; payload?: { pattern?: string } }

export const GitHubSearchEnv = (
  api: GitHubSearchApi,
  seedQuery: string,
  options: { initialFetch?: boolean } = {},
): Environment<GhState, GhAction> => {
  let current: GhState = { query: seedQuery, hits: 0, entropy: 1 }
  let initialized = false
  const initialFetch = options.initialFetch ?? true

  const fetch = async (query: string) => {
    const response = await api.search(query, { perPage: 10 })
    current = { query, ...response }
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
      return sanitizeQuery(
        `${query} "${pickExact(action.payload?.exact)}"`,
      )
    case 'rephrase':
      return sanitizeQuery(
        `${query} ${action.payload?.pattern ?? 'best practices'}`,
      )
    default:
      return query
  }
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
