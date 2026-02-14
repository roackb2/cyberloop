/**
 * Revised AICL Demo — GitHub search using cyberloop() with SteppableAgent
 *
 * Same search logic as agent-demo.ts (DeterministicSearchPolicy + env),
 * but expressed as a SteppableAgent wrapped with cyberloop() middleware.
 *
 * Requires: OPENAI_API_KEY, GITHUB_TOKEN environment variables.
 *
 * Run: yarn examples:github:cyberloop
 */

import 'dotenv/config'

import { Command } from 'commander'

import { DeterministicSearchPolicy } from '@/adapters/github/deterministic-policy'
import type { GhAction, GhState } from '@/adapters/github/env'
import { GitHubSearchEnv } from '@/adapters/github/env'
import type { SearchFilters } from '@/adapters/github/search-tool'
import { createGitHubSearchApi } from '@/adapters/github/search-tool'
import { logger } from '@/adapters/github/telemetry'
import type { AgentResult, StepOutput, SteppableAgent } from '@/core/agent-protocol'
import { ProportionalLadder } from '@/core/ladder/proportional'
import { telemetryMiddleware } from '@/core/middleware/telemetry'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Setup
// ---------------------------------------------------------------------------

function validateEnv(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required')
    process.exit(1)
  }
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required')
    process.exit(1)
  }
}

const program = new Command()
  .name('agent-demo-cyberloop')
  .description('GitHub AICL search using cyberloop() wrapper')
  .option('-q, --query <string>', 'Search query', 'node graceful shutdown')
  .option('-s, --max-steps <number>', 'Max inner loop steps', '20')
  .parse()

const cliOpts = program.opts<{ query: string; maxSteps: string }>()

// ---------------------------------------------------------------------------
// 2. Define the SteppableAgent
// ---------------------------------------------------------------------------

interface GhSearchResult extends AgentResult {
  totalSteps: number
  finalHits: number
}

function createGitHubSearchAgent(query: string): SteppableAgent<GhState, string, GhSearchResult> {
  const searchApi = createGitHubSearchApi()
  const initialFilters: SearchFilters = { keywords: [query] }
  const env = GitHubSearchEnv(searchApi, initialFilters, { initialFetch: false, log: true })
  const policy = new DeterministicSearchPolicy()
  const ladder = new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 })

  let stepCount = 0

  return {
    run(input: string): Promise<GhSearchResult> {
      // Fallback opaque path — delegates to cyberloop steppable path
      return Promise.resolve({ output: `Search for: ${input}`, totalSteps: 0, finalHits: 0 })
    },

    async getInitialState(_input: string): Promise<GhState> {
      const state = await env.observe()
      policy.initialize(state)
      stepCount = 0
      return state
    },

    async step(state: GhState): Promise<StepOutput<GhState>> {
      const action: GhAction = await policy.decide(state, ladder)
      const nextState = await env.apply(action)
      stepCount++

      logger.info({
        step: stepCount,
        action: action.type,
        hits: nextState.hits,
        stable: policy.isStable(nextState),
      }, `[Step ${stepCount}]`)

      return {
        state: nextState,
        action,
        cost: 1,
      }
    },

    isDone(state: GhState): boolean {
      return policy.isStable(state)
    },

    toResult(state: GhState): GhSearchResult {
      const items = state.items ?? []
      const summary = items
        .slice(0, 5)
        .map((item, i) => `  ${i + 1}. ${item.title} (⭐ ${item.stars ?? 0}) — ${item.url}`)
        .join('\n')

      return {
        output: `Found ${state.hits} repositories.\n\nTop results:\n${summary}`,
        totalSteps: stepCount,
        finalHits: state.hits,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Wrap with cyberloop()
// ---------------------------------------------------------------------------

const maxSteps = parseInt(cliOpts.maxSteps, 10)
const agent = createGitHubSearchAgent(cliOpts.query)

const wrapped = cyberloop<GhState>(agent, {
  budget: { maxSteps },
  middleware: [telemetryMiddleware<GhState>(logger)],
  on: {
    onHalt(reason) {
      logger.info(`⛔ Halted: ${reason}`)
    },
  },
})

// ---------------------------------------------------------------------------
// 4. Run
// ---------------------------------------------------------------------------

async function main() {
  validateEnv()

  logger.info(`\n🔍 GitHub Search with CyberLoop Wrapper`)
  logger.info(`Query: "${cliOpts.query}", maxSteps: ${maxSteps}\n`)

  const result = await wrapped.run(cliOpts.query) as GhSearchResult

  logger.info('\n' + '='.repeat(80))
  logger.info('📊 Results:')
  logger.info('='.repeat(80))
  logger.info(result.output)
  logger.info('\n' + '='.repeat(80))
  logger.info(`🔄 Steps: ${result.totalSteps}`)
  logger.info(`📦 Final Hits: ${result.finalHits}`)
  logger.info('='.repeat(80))
}

main().catch(console.error)
