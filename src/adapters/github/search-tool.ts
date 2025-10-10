import { Octokit } from '@octokit/rest'
import { tool } from '@openai/agents'

export interface GitHubSearchItem {
  title: string
  url: string
  labels: string[]
  stars: number
}

export interface GitHubSearchResult {
  hits: number
  entropy: number
  items: GitHubSearchItem[]
}

export interface GitHubSearchApi {
  search(query: string, opts?: { perPage?: number }): Promise<GitHubSearchResult>
}

interface GitHubSearchInput {
  query: string
  per_page?: number
}

function parseGitHubSearchInput(input: unknown): GitHubSearchInput {
  if (!input || typeof input !== 'object') {
    throw new Error('github_search parameters must be an object')
  }

  const maybeRecord = input as Record<string, unknown>
  const { query, per_page } = maybeRecord

  if (typeof query !== 'string') {
    throw new Error('github_search requires a string "query" property')
  }

  if (typeof per_page === 'undefined') {
    return { query }
  }

  if (typeof per_page !== 'number' || !Number.isInteger(per_page)) {
    throw new Error('github_search "per_page" must be an integer')
  }

  if (per_page < 1 || per_page > 30) {
    throw new Error('github_search "per_page" must be between 1 and 30')
  }

  return { query, per_page }
}

export function createGitHubSearchApi(token = process.env.GITHUB_TOKEN): GitHubSearchApi {
  if (!token) throw new Error('GITHUB_TOKEN env variable is required for live GitHub search.')
  const octokit = new Octokit({ auth: token })
  return {
    async search(query, opts = {}) {
      const perPage = opts.perPage ?? 10
      const response = await octokit.rest.search.repos({
        q: query,
        per_page: perPage,
        sort: 'stars',
        order: 'desc',
      })
      const repos = (response.data.items ?? []) as {
        full_name: string
        description?: string | null
        stargazers_count?: number
        html_url?: string
      }[]
      const items = repos.map(item => ({
        title: item.full_name,
        labels: item.description ? [item.description] : [],
        stars: item.stargazers_count ?? 0,
        url: item.html_url ?? '',
      }))
      return {
        hits: response.data.total_count ?? items.length,
        entropy: computeEntropy(items),
        items,
      }
    },
  }
}

export function createGitHubSearchTool(api: GitHubSearchApi) {
  return tool({
    name: 'github_search',
    description: 'Search top GitHub repositories matching a query string.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for GitHub repositories',
        },
        per_page: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          default: 30,
          description: 'Maximum number of repositories to return (default 10)',
        },
      },
      required: ['query', 'per_page'],
      additionalProperties: false,
    },
    async execute(rawInput: unknown) {
      const { query, per_page } = parseGitHubSearchInput(rawInput)
      return api.search(query, { perPage: per_page })
    },
  })
}

function computeEntropy(items: GitHubSearchItem[]): number {
  if (!items.length) return 0
  const starCounts = items.map(i => i.stars || 0)
  const max = Math.max(...starCounts)
  const min = Math.min(...starCounts)
  if (max === 0) return 0
  return (max - min) / (max + 1)
}
