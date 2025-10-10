import type { GhAction, GhState } from '@/adapters/github/env.js'
import {
  entropyGuardProbe,
  GitHubSearchEnv,
  hasHitsProbe,
  QueryMutatePolicy,
  SearchFailureSelector,
} from '@/adapters/github/index.js'
import {
  DeltaScoreEvaluator,
  ProportionalLadder,
  ReasonFailureClassifier,
  SimpleBudgetTracker,
  StagnationTerminationPolicy,
} from '@/core/defaults.js'
import { Orchestrator } from '@/core/orchestrator.js'
import type { LoopEvents } from '@/core/runtime/events.js'

const mockSearchApi = {
  async search(query: string) {
    const base = Math.max(4, 40 - query.length)
    const noise = Math.floor(Math.random() * 8)
    const hits = Math.max(0, base + noise)
    const entropy = clamp(0.05, 0.95,
      0.9 - Math.min(0.5, query.split(/\s+/).length * 0.05) + Math.random() * 0.1,
    )
    const items = createMockItems(query, hits)
    return { hits, entropy, items }
  },
}

async function main() {
  const seed = process.argv.slice(2).join(' ') || 'node graceful shutdown'
  const env = GitHubSearchEnv(mockSearchApi, seed)

  const evaluator = DeltaScoreEvaluator<GhState>((prev, next) => next.hits - prev.hits)
  const ladder = new ProportionalLadder({ gainUp: 0.6, gainDown: 0.4, max: 3 })
  const budget = new SimpleBudgetTracker(10)
  const selector = new SearchFailureSelector()
  const probes = [hasHitsProbe, entropyGuardProbe]
  const policies = [QueryMutatePolicy]
  const termination = new StagnationTerminationPolicy({ maxStagnantSteps: 3, minFeedback: -5 })
  const failureClassifier = new ReasonFailureClassifier<GhState, GhAction>({
    entropyHigh: 0.85,
    entropyLow: 0.1,
    sparseHits: 2,
    denseHits: 60,
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
    events,
  })

  const { logs } = await orchestrator.run()
  console.table(
    logs.map(log => ({
      t: log.t,
      action: log.action?.type ?? log.failure ?? 'probe-block',
      query: log.next?.query ?? log.state.query,
      hits: log.next?.hits ?? log.state.hits,
      score: log.score ?? 0,
      ladder: log.ladderLevel.toFixed(2),
      budget: log.budgetRemaining.toFixed(2),
      probe: log.probeId,
      policy: log.policyId,
    })),
  )
}
function createMockItems(query: string, hits: number) {
  const count = Math.min(5, Math.max(1, Math.floor(hits / 10) + 1))
  return Array.from({ length: count }, (_, i) => ({
    title: `${capitalize(query)} – sample ${i + 1}`,
    url: `https://github.com/example/${slugify(query)}/${i + 1}`,
    labels: ['demo', 'mock'],
    stars: Math.floor(Math.random() * 5000),
  }))
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'query'
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}

await main()
