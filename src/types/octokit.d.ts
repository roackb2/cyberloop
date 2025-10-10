declare module '@octokit/rest' {
  interface SearchRepoItem {
    full_name: string
    description?: string | null
    stargazers_count?: number
    html_url?: string
  }

  interface SearchReposResponse {
    data: {
      total_count: number
      items: SearchRepoItem[]
    }
  }

  export class Octokit {
    constructor(options?: { auth?: string })
    rest: {
      search: {
        repos(params: {
          q: string
          per_page?: number
          sort?: string
          order?: string
        }): Promise<SearchReposResponse>
      }
    }
  }
}
