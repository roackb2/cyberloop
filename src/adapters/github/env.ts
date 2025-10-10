import type { Environment } from '@/core/interfaces'

export interface GhItem {
  title: string
  url: string
  labels?: string[]
  stars?: number
}

export interface GhState {
  query: string
  hits: number
  entropy: number
  items?: GhItem[]
}

export type GhAction =
  | { type: 'broaden'; payload?: { synonyms?: string[] } }
  | { type: 'narrow'; payload?: { exact?: string[] } }
  | { type: 'rephrase'; payload?: { pattern?: string } }

interface GitHubSearchApi {
  search(query: string): Promise<{ hits: number; entropy: number; items: GhItem[] }>
}

export const GitHubSearchEnv = (
  api: GitHubSearchApi,
  seedQuery: string,
): Environment<GhState, GhAction> => {
  let current: GhState = { query: seedQuery, hits: 0, entropy: 1 }

  return {
    observe: () => current,
    apply: async (action) => {
      const nextQuery = mutateQuery(current.query, action)
      const response = await api.search(nextQuery)
      current = { query: nextQuery, ...response }
      return current
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
