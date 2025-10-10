import 'dotenv/config'

import { Agent, run } from '@openai/agents'

import { AgentRelevanceEvaluator } from '@/adapters/github/agent-evaluator.js'
import { AgentQueryPolicy } from '@/adapters/github/agent-policy.js'
import type { GhAction, GhState } from '@/adapters/github/env.js'
import {
  dropGuardProbe,
  entropyGuardProbe,
  GitHubSearchEnv,
  hasHitsProbe,
  SearchFailureSelector,
} from '@/adapters/github/index.js'
import type { GitHubSearchApi } from '@/adapters/github/search-tool.js'
import { createGitHubSearchApi } from '@/adapters/github/search-tool.js'
import {
  ProportionalLadder,
  ReasonFailureClassifier,
  SimpleBudgetTracker,
  StagnationTerminationPolicy,
} from '@/core/defaults.js'
import type { StepLog } from '@/core/orchestrator.js'
import { Orchestrator } from '@/core/orchestrator.js'
import type { LoopEvents } from '@/core/runtime/events.js'

async function generateSummary(
  api: GitHubSearchApi,
  finalState: GhState,
  logs: StepLog<GhState, GhAction, number>[],
): Promise<void> {
  // Find the best state with most hits during exploration
  const bestState = logs.reduce((best, log) => {
    const state = log.next ?? log.state
    return (state.hits > (best?.hits ?? 0)) ? state : best
  }, logs[0]?.state)

  // Fetch fresh data from the best query to get actual repository details
  const bestResults = await api.search(bestState.query, { perPage: 10 })
  
  const agent = new Agent({
    name: 'SummaryAgent',
    instructions: `You are a GitHub research assistant. Your job is to:

1. **Answer the user's original question** using the repositories found
2. **Recommend specific repositories** with clear reasons why they're relevant
3. **Provide usage guidance** - how to use the recommended solutions
4. **Note any gaps** - what wasn't found or needs further investigation

Focus on ACTIONABLE ANSWERS, not just describing the search process.
Format with markdown. Be specific and cite repository names/URLs.`,
  })

  const summary = {
    originalQuestion: logs[0]?.state.query,
    bestQuery: bestState.query,
    totalSteps: logs.length,
    explorationPath: logs.map(log => ({
      step: log.t,
      query: (log.next ?? log.state).query,
      hits: (log.next ?? log.state).hits,
      action: log.action?.type ?? 'probe-block',
    })),
    repositoriesFound: bestResults.items?.slice(0, 10).map(item => ({
      name: item.title,
      url: item.url,
      stars: item.stars,
      description: item.title, // GitHub API returns title as description in mock
      labels: item.labels,
    })),
    searchMetrics: {
      totalHits: bestResults.hits,
      probeFailures: finalState.probes?.filter(p => !p.pass).length ?? 0,
      strategyChanges: logs.filter((log, i) => 
        i > 0 && (log.action?.type !== logs[i - 1]?.action?.type)
      ).length,
    },
  }

  const result = await run(agent, JSON.stringify(summary, null, 2))
  console.log(result.finalOutput)
}

async function main() {
  validateEnv()
  const searchApi = createGitHubSearchApi()
  const cliQuery = process.argv.slice(2).join(' ')
  const seed = cliQuery || (process.env.GITHUB_AGENT_QUERY ?? 'node graceful shutdown')
  const env = GitHubSearchEnv(searchApi, seed, { initialFetch: true, log: true })

  const evaluator = new AgentRelevanceEvaluator()
  const ladder = new ProportionalLadder({ gainUp: 0.5, gainDown: 0.4, max: 3 })
  const budget = new SimpleBudgetTracker(20)
  const selector = new SearchFailureSelector({ preferLlm: true })
  const probes = [hasHitsProbe, entropyGuardProbe, dropGuardProbe]
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
      const status = result.pass ? '✓' : '✗'
      const msg = result.pass 
        ? `${status} [t=${t}] Probe ${probe.id} passed`
        : `${status} [t=${t}] Probe ${probe.id} blocked: ${result.reason ?? 'unknown'}`
      console.log(msg)
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
  console.log('\n📊 Loop Summary:')
  console.table(
    logs.map(log => ({
      t: log.t,
      query: (log.next?.query ?? log.state.query).slice(0, 40),
      hits: log.next?.hits ?? log.state.hits,
      action: log.action?.type ?? log.failure ?? 'probe-block',
      score: log.score?.toFixed(2) ?? '0.00',
      ladder: log.ladderLevel.toFixed(2),
      budget: log.budgetRemaining.toFixed(2),
      probes: (log.next?.probes ?? log.state.probes)?.length ?? 0,
      policy: log.policyId,
    })),
  )
  
  // Show final probe history
  const finalState = logs[logs.length - 1]?.next ?? logs[logs.length - 1]?.state
  if (finalState?.probes && finalState.probes.length > 0) {
    console.log('\n🔍 Probe History (last 5):')
    console.table(
      finalState.probes.slice(-5).map(p => ({
        id: p.id,
        pass: p.pass ? '✓' : '✗',
        reason: p.reason ?? 'passed',
        data: p.data ? JSON.stringify(p.data) : '-',
      }))
    )
  }

  // Generate investigation summary
  console.log('\n📝 Investigation Summary:')
  await generateSummary(searchApi, finalState, logs)
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
