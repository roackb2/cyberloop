import 'dotenv/config'

import { AgentRelevanceEvaluator } from '@/adapters/github/agent-evaluator.js'
import { AgentQueryPolicy } from '@/adapters/github/agent-policy.js'
import type { GhAction, GhState } from '@/adapters/github/env.js'
import {
  entropyGuardProbe,
  GitHubSearchEnv,
  hasHitsProbe,
  SearchFailureSelector,
} from '@/adapters/github/index.js'
import { createGitHubSearchApi } from '@/adapters/github/search-tool.js'
import {
  ProportionalLadder,
  ReasonFailureClassifier,
  SimpleBudgetTracker,
  StagnationTerminationPolicy,
} from '@/core/defaults.js'
import { Orchestrator } from '@/core/orchestrator.js'
import type { LoopEvents } from '@/core/runtime/events.js'

async function main() {
  validateEnv()
  const searchApi = createGitHubSearchApi()
  const cliQuery = process.argv.slice(2).join(' ')
  const seed = cliQuery || process.env.GITHUB_AGENT_QUERY || 'node graceful shutdown'
  const env = GitHubSearchEnv(searchApi, seed, { initialFetch: true })

  const evaluator = new AgentRelevanceEvaluator()
  const ladder = new ProportionalLadder({ gainUp: 0.5, gainDown: 0.4, max: 3 })
  const budget = new SimpleBudgetTracker(20)
  const selector = new SearchFailureSelector({ preferLlm: true })
  const probes = [hasHitsProbe, entropyGuardProbe]
  const policies = [new AgentQueryPolicy(searchApi)]
  const termination = new StagnationTerminationPolicy({ maxStagnantSteps: 4, minFeedback: -2 })
  const failureClassifier = new ReasonFailureClassifier<GhState, GhAction>({
    entropyHigh: 0.85,
    entropyLow: 0.15,
    sparseHits: 3,
    denseHits: 80,
  })

  const events: LoopEvents<GhState, GhAction, number> = {
    onProbeResult: ({ t, probe, result }) => {
      if (!result.pass) {
        console.log(`⚠️  [t=${t}] Probe ${probe.id} blocked path: ${result.reason ?? 'unknown'}`)
      }
    },
    onStrategySwitch: ({ t, from, to, reason }) => {
      console.log(`🔀 [t=${t}] Strategy switch ${from} -> ${to} (reason=${reason})`)
    },
    onBudget: ({ t, delta, after }) => {
      const consumed = typeof delta === 'number' ? delta : JSON.stringify(delta)
      console.log(`💰 [t=${t}] cost=${consumed} remaining=${after.toFixed(2)}`)
    },
    onStop: ({ t, reason }) => {
      console.log(`🛑 loop stopped at t=${t} (${reason})`)
    },
  }

  const orchestrator = new Orchestrator<GhState, GhAction, number>({
    env,
    evaluator,
    ladder,
    budget,
    selector,
    probes,
    policies,
    maxSteps: 8,
    termination,
    failureClassifier,
    retry: { decide: 1, apply: 1 },
    events,
  })

  const { logs } = await orchestrator.run()
  console.table(
    logs.map(log => ({
      t: log.t,
      query: log.next?.query ?? log.state.query,
      hits: log.next?.hits ?? log.state.hits,
      action: log.action?.type ?? log.failure ?? 'probe-block',
      score: log.score?.toFixed(2) ?? '0.00',
      ladder: log.ladderLevel.toFixed(2),
      budget: log.budgetRemaining.toFixed(2),
      policy: log.policyId,
      probe: log.probeId,
    })),
  )
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
  console.error('GitHub agent demo failed:', err)
  process.exitCode = 1
})
