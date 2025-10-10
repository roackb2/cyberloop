import type { Environment } from '@/core/interfaces'

export interface GhState {
  query: string
  hits: number
  entropy: number
  items?: unknown[]
}

export type GhAction =
  | { type: 'broaden'; payload?: unknown }
  | { type: 'narrow'; payload?: unknown }
  | { type: 'rephrase'; payload?: unknown }

interface GitHubSearchApi {
  search(query: string): Promise<{ hits: number; entropy: number; items: unknown[] }>
}

export const GitHubSearchEnv = (
  api: GitHubSearchApi,
  seedQuery: string,
): Environment<GhState, GhAction> => {
  let current: GhState = { query: seedQuery, hits: 0, entropy: 0 }

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
      return `${query} OR alternative`
    case 'narrow':
      return `${query} "specific"`
    case 'rephrase':
      return query.replace(/(\w+)/, '$1 refined')
    default:
      return query
  }
}
