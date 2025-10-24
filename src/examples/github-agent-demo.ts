import 'dotenv/config'

import { DeterministicSearchPolicy } from '@/adapters/github/deterministic-policy'
import type { GhAction, GhState } from '@/adapters/github/env'
import { GitHubSearchEnv } from '@/adapters/github/env'
import { GitHubPlanner } from '@/adapters/github/planner'
import { hasHitsProbe } from '@/adapters/github/probes'
import type { SearchFilters } from '@/adapters/github/search-tool'
import { createGitHubSearchApi } from '@/adapters/github/search-tool'
import { logger } from '@/adapters/github/telemetry'
import { createControlBudget } from '@/core/budget/control-budget'
import { DeltaScoreEvaluator, ProportionalLadder } from '@/core/defaults'
import { Orchestrator } from '@/core/orchestrator'

async function main() {
  validateEnv()

  const searchApi = createGitHubSearchApi()
  const cliQuery = process.argv.slice(2).join(' ')
  const userQuery = cliQuery || (process.env.GITHUB_AGENT_QUERY ?? 'node graceful shutdown')

  logger.info(`\n🔍 GitHub Search with AICL (Inner/Outer Loop)`)
  logger.info(`Query: "${userQuery}"\n`)

  // Create components
  const initialFilters: SearchFilters = { keywords: [userQuery] }
  const env = GitHubSearchEnv(searchApi, initialFilters, { initialFetch: false, log: true })
  const probePolicy = new DeterministicSearchPolicy()
  const planner = new GitHubPlanner(searchApi)
  const evaluator = DeltaScoreEvaluator<GhState>((prev, next) => {
    // Simple evaluator: positive if hits increased, negative if decreased
    return next.hits - prev.hits
  })
  const ladder = new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 })
  const budget = createControlBudget(20, 6) // 20 inner loop, 6 outer loop
  const probes = [hasHitsProbe]

  // Create orchestrator
  const orchestrator = new Orchestrator<GhState, GhAction, number>({
    env,
    probePolicy,
    planner,
    probes,
    evaluator,
    ladder,
    budget,
    maxInnerSteps: 20,
    logger,
  })

  // Run!
  const result = await orchestrator.run(userQuery)

  logger.info('\n' + '='.repeat(80))
  logger.info('📊 Results:')
  logger.info('='.repeat(80))
  logger.info(result.output)
  logger.info('\n' + '='.repeat(80))
  logger.info(`⏱️  Exploration Attempts: ${result.explorationAttempts}`)
  logger.info(`🔄 Inner Loop Steps: ${result.innerLoopSteps}`)
  logger.info(`🤖 Outer Loop Calls: ${result.outerLoopCalls}`)
  logger.info('='.repeat(80))
}

function validateEnv() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required')
    process.exit(1)
  }
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required')
    process.exit(1)
  }
}

main().catch(console.error)
