/**
 * Revised Baseline — OpenAI Agent wrapped with cyberloop()
 *
 * Same baseline agent as baseline-demo.ts (no AICL control loop), but wrapped
 * with cyberloop() to add budget tracking and telemetry as an opaque agent.
 *
 * Requires: OPENAI_API_KEY, GITHUB_TOKEN environment variables.
 *
 * Run: yarn examples:github:baseline:cyberloop
 */

import 'dotenv/config'

import { Agent, run as runAgent } from '@openai/agents'
import { Command } from 'commander'

import {
  createGitHubSearchApi,
  createGitHubSearchTool,
  logger,
} from '@/adapters/github'
import type { AgentResult } from '@/core/agent-protocol'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Setup
// ---------------------------------------------------------------------------

function validateEnv(): void {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required.')
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required.')
  }
}

const program = new Command()
  .name('baseline-demo-cyberloop')
  .description('Baseline GitHub agent wrapped with cyberloop()')
  .option('-q, --query <string>', 'Search query', 'node graceful shutdown')
  .parse()

const cliOpts = program.opts<{ query: string }>()

// ---------------------------------------------------------------------------
// 2. Create the OpenAI Agent (same as legacy baseline)
// ---------------------------------------------------------------------------

const searchApi = createGitHubSearchApi()

const agent = new Agent({
  name: 'BaselineGitHubAgent',
  instructions: `You are a GitHub repository search assistant with multi-dimensional search capabilities.

Your task: Find the best repositories for the user's query: "${cliOpts.query}"

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

// ---------------------------------------------------------------------------
// 3. Wrap with cyberloop() — adds budget + telemetry to the opaque agent
// ---------------------------------------------------------------------------

let toolCalls = 0
const originalSearch = searchApi.search.bind(searchApi)
searchApi.search = async (query, opts) => {
  toolCalls++
  const queryStr = typeof query === 'string' ? query : JSON.stringify(query)
  logger.info(`🔧 [Tool Call ${toolCalls}] Searching: "${queryStr}"`)
  return originalSearch(query, opts)
}

const wrapped = cyberloop<unknown>(
  {
    async run(input: string): Promise<AgentResult> {
      const result = await runAgent(agent, input)
      return { output: result.finalOutput ?? '', toolCalls }
    },
  },
  {
    budget: { maxSteps: 5 },
    on: {
      beforeStep(ctx) {
        logger.info(`[CyberLoop] beforeStep — step=${ctx.step}`)
      },
      afterStep(_ctx, result) {
        logger.info(`[CyberLoop] afterStep — output length=${(result.state as AgentResult).output.length}`)
      },
      onHalt(reason) {
        logger.info(`[CyberLoop] Halted: ${reason}`)
      },
    },
  },
)

// ---------------------------------------------------------------------------
// 4. Run
// ---------------------------------------------------------------------------

async function main() {
  validateEnv()

  const startTime = Date.now()

  logger.info(`\n🔍 Baseline Agent + CyberLoop Wrapper`)
  logger.info(`Query: "${cliOpts.query}"\n`)

  const result = await wrapped.run(cliOpts.query)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  logger.info('\n' + '='.repeat(80))
  logger.info('📊 Baseline + CyberLoop Results:')
  logger.info('='.repeat(80))
  logger.info(result.output)
  logger.info('\n' + '='.repeat(80))
  logger.info(`⏱️  Duration: ${duration}s`)
  logger.info(`🔧 Tool Calls: ${toolCalls}`)
  logger.info('='.repeat(80))
}

await main().catch(err => {
  console.error('Baseline demo failed:', err)
  process.exitCode = 1
})
