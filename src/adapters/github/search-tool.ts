import { Octokit } from '@octokit/rest'
import type { FunctionTool } from '@openai/agents'
import { tool } from '@openai/agents'
import { z } from 'zod'

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

export const GitHubSearchParameters = z.object({
  query: z.string().describe('Search query for GitHub repositories'),
  per_page: z.number().min(1).max(30).optional().describe('Maximum number of repositories to return (default 10)'),
}).strict()

export type GitHubSearchTool = FunctionTool<unknown, typeof GitHubSearchParameters, GitHubSearchResult>

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

export function createGitHubSearchTool(api: GitHubSearchApi): GitHubSearchTool {
  return tool({
    name: 'github_search',
    description: 'Search top GitHub repositories matching a query string.',
    parameters: GitHubSearchParameters,
    async execute({ query, per_page }: { query: string; per_page?: number }) {
      return api.search(query, { perPage: per_page })
    },
  }) as GitHubSearchTool
}

function computeEntropy(items: GitHubSearchItem[]): number {
  if (!items.length) return 0
  const starCounts = items.map(i => i.stars || 0)
  const max = Math.max(...starCounts)
  const min = Math.min(...starCounts)
  if (max === 0) return 0
  return (max - min) / (max + 1)
}
