import 'dotenv/config'

import { Agent, run } from '@openai/agents'

import {
  createGitHubSearchApi,
  createGitHubSearchTool,
  logger,
} from '@/adapters/github'

/**
 * Baseline: Agent with NO control loop
 * - No probes (no gradient signals)
 * - No evaluator (no feedback)
 * - No ladder (no exploration regulation)
 * - No budget tracker (unbounded)
 * - Just raw agent with tool access
 */
async function main() {
  validateEnv()

  const searchApi = createGitHubSearchApi()
  const cliQuery = process.argv.slice(2).join(' ')
  const seed = cliQuery || (process.env.GITHUB_AGENT_QUERY ?? 'node graceful shutdown')

  logger.info(`\n🔍 Baseline Agent (No Control Loop)`)
  logger.info(`Query: "${seed}"\n`)

  const agent = new Agent({
    name: 'BaselineGitHubAgent',
    instructions: `You are a GitHub repository search assistant with multi-dimensional search capabilities.

Your task: Find the best repositories for the user's query: "${seed}"

You have access to github_search with these dimensions:
- keywords: Main search terms (AND combined)
- or_keywords: Alternative terms (OR combined)
- language: Programming language filter
- min_stars/max_stars: Star count filters
- topic: GitHub topic
- in_name/in_description: Search scope

Strategy: Start broad, then refine based on results. Adjust multiple dimensions to find the best matches.

After exploring, provide a summary with:
1. Top repository recommendations
2. Why they're relevant
3. How to use them`,
    tools: [createGitHubSearchTool(searchApi)],
  })

  const startTime = Date.now()
  let toolCalls = 0
  const originalSearch = searchApi.search.bind(searchApi)
  searchApi.search = async (query, opts) => {
    toolCalls++
    const queryStr = typeof query === 'string' ? query : JSON.stringify(query)
    logger.info(`🔧 [Tool Call ${toolCalls}] Searching: "${queryStr}"`)
    return originalSearch(query, opts)
  }

  const result = await run(agent, seed)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  logger.info('\n' + '='.repeat(80))
  logger.info('📊 Baseline Results:')
  logger.info('='.repeat(80))
  logger.info(result.finalOutput)
  logger.info('\n' + '='.repeat(80))
  logger.info(`⏱️  Duration: ${duration}s`)
  logger.info(`🔧 Tool Calls: ${toolCalls}`)
  logger.info(`💰 Estimated Cost: ${toolCalls * 2} units (no budget tracking)`)
  logger.info('='.repeat(80))
}

function validateEnv(): void {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required.')
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required.')
  }
}

await main().catch(err => {
  console.error('Baseline demo failed:', err)
  process.exitCode = 1
})
