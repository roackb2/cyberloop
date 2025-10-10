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

export interface SearchFilters {
  keywords: string[]        // Main search terms (AND combined)
  orKeywords?: string[]     // Alternative terms (OR combined)
  language?: string         // Programming language filter
  minStars?: number         // Minimum star count
  maxStars?: number         // Maximum star count
  topic?: string            // GitHub topic filter
  inName?: boolean          // Search in repository name only
  inDescription?: boolean   // Search in description
}

export interface GitHubSearchApi {
  search(query: string | SearchFilters, opts?: { perPage?: number }): Promise<GitHubSearchResult>
}

interface GitHubSearchInput {
  keywords: string[]
  or_keywords?: string[]
  language?: string
  min_stars?: number
  max_stars?: number
  topic?: string
  in_name?: boolean
  in_description?: boolean
  per_page?: number
}

function parseGitHubSearchInput(input: unknown): GitHubSearchInput {
  if (!input || typeof input !== 'object') {
    throw new Error('github_search parameters must be an object')
  }

  const maybeRecord = input as Record<string, unknown>
  const { keywords, or_keywords, language, min_stars, max_stars, topic, in_name, in_description, per_page } = maybeRecord

  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('github_search requires a non-empty "keywords" array')
  }

  if (!keywords.every(k => typeof k === 'string')) {
    throw new Error('all keywords must be strings')
  }

  const result: GitHubSearchInput = { keywords }

  if (or_keywords !== undefined) {
    if (!Array.isArray(or_keywords)) throw new Error('"or_keywords" must be an array')
    result.or_keywords = or_keywords
  }
  if (language !== undefined) {
    if (typeof language !== 'string') throw new Error('"language" must be a string')
    result.language = language
  }
  if (min_stars !== undefined) {
    if (typeof min_stars !== 'number') throw new Error('"min_stars" must be a number')
    result.min_stars = min_stars
  }
  if (max_stars !== undefined) {
    if (typeof max_stars !== 'number') throw new Error('"max_stars" must be a number')
    result.max_stars = max_stars
  }
  if (topic !== undefined) {
    if (typeof topic !== 'string') throw new Error('"topic" must be a string')
    result.topic = topic
  }
  if (in_name !== undefined) {
    if (typeof in_name !== 'boolean') throw new Error('"in_name" must be a boolean')
    result.in_name = in_name
  }
  if (in_description !== undefined) {
    if (typeof in_description !== 'boolean') throw new Error('"in_description" must be a boolean')
    result.in_description = in_description
  }
  if (per_page !== undefined) {
    if (typeof per_page !== 'number' || !Number.isInteger(per_page)) {
      throw new Error('"per_page" must be an integer')
    }
    if (per_page < 1 || per_page > 30) {
      throw new Error('"per_page" must be between 1 and 30')
    }
    result.per_page = per_page
  }

  return result
}

function buildGitHubQuery(filters: SearchFilters): string {
  const parts: string[] = []

  // Main keywords (AND combined)
  const mainQuery = filters.keywords.join(' ')
  parts.push(mainQuery)

  // OR keywords
  if (filters.orKeywords && filters.orKeywords.length > 0) {
    parts.push('OR ' + filters.orKeywords.join(' OR '))
  }

  // Language filter
  if (filters.language) {
    parts.push(`language:${filters.language}`)
  }

  // Star filters
  if (filters.minStars !== undefined && filters.maxStars !== undefined) {
    parts.push(`stars:${filters.minStars}..${filters.maxStars}`)
  } else if (filters.minStars !== undefined) {
    parts.push(`stars:>=${filters.minStars}`)
  } else if (filters.maxStars !== undefined) {
    parts.push(`stars:<=${filters.maxStars}`)
  }

  // Topic filter
  if (filters.topic) {
    parts.push(`topic:${filters.topic}`)
  }

  // Search scope filters
  if (filters.inName) {
    parts.push('in:name')
  }
  if (filters.inDescription) {
    parts.push('in:description')
  }

  return parts.join(' ')
}

export function createGitHubSearchApi(token = process.env.GITHUB_TOKEN): GitHubSearchApi {
  if (!token) throw new Error('GITHUB_TOKEN env variable is required for live GitHub search.')
  const octokit = new Octokit({ auth: token })
  return {
    async search(queryOrFilters, opts = {}) {
      // Support both string queries (backward compat) and structured filters
      const query = typeof queryOrFilters === 'string' 
        ? queryOrFilters 
        : buildGitHubQuery(queryOrFilters)
      
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
    description: 'Search GitHub repositories with structured filters. Use multiple dimensions to narrow or broaden search.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Main search keywords (AND combined). E.g. ["rust", "async", "runtime"]',
        },
        or_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alternative keywords (OR combined). E.g. ["tokio", "async-std"]',
        },
        language: {
          type: 'string',
          description: 'Filter by programming language. E.g. "rust", "python", "javascript"',
        },
        min_stars: {
          type: 'integer',
          description: 'Minimum star count',
        },
        max_stars: {
          type: 'integer',
          description: 'Maximum star count',
        },
        topic: {
          type: 'string',
          description: 'GitHub topic filter. E.g. "async", "web-framework"',
        },
        in_name: {
          type: 'boolean',
          description: 'Search only in repository name',
        },
        in_description: {
          type: 'boolean',
          description: 'Search only in repository description',
        },
      },
      required: ['keywords'],
      additionalProperties: true,
    } as const,
    async execute(rawInput: unknown) {
      const { keywords, or_keywords, language, min_stars, max_stars, topic, in_name, in_description, per_page } = parseGitHubSearchInput(rawInput)
      return api.search({
        keywords,
        orKeywords: or_keywords,
        language,
        minStars: min_stars,
        maxStars: max_stars,
        topic,
        inName: in_name,
        inDescription: in_description,
      }, { perPage: per_page })
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
