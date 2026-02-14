/**
 * Revised Wikipedia Navigation — CyberLoop mode using cyberloop() wrapper
 *
 * Implements the full CyberLoop stack (stochastic policy + kinematics + guards + reflexes)
 * as a SteppableAgent wrapped with cyberloop() middleware.
 *
 * Only the main "cyberloop" mode is ported here. For other benchmark modes
 * (greedy, boredom, cot, etc.), see the legacy demo.ts.
 *
 * Requires: OPENAI_API_KEY environment variable.
 *
 * Run: yarn examples:wikipedia:cyberloop
 *      yarn examples:wikipedia:cyberloop -- --scenario revolution
 */

import 'dotenv/config'

import { Command } from 'commander'
import { OpenAI } from 'openai'

import { WikipediaEmbedder } from '@/adapters/wikipedia/embedder'
import { WikipediaEnv } from '@/adapters/wikipedia/env'
import { StochasticHeuristicPolicy } from '@/adapters/wikipedia/policy'
import { logger, setupBenchmarkLogger } from '@/adapters/wikipedia/telemetry'
import type { WikiAction, WikiState } from '@/adapters/wikipedia/types'
import { kinematicsMiddleware } from '@/advanced/kinematics-middleware'
import type { AgentResult, StepOutput, SteppableAgent } from '@/core/agent-protocol'
import type { StateEmbedder } from '@/core/kinematics/interfaces'
import { ProportionalLadder } from '@/core/ladder/proportional'
import { telemetryMiddleware } from '@/core/middleware/telemetry'
import { ChainPolicy } from '@/core/policy/chain'
import { BlacklistGuard } from '@/core/policy/guards/blacklist'
import { BoredomGuard } from '@/core/policy/guards/boredom'
import { LineOfSightReflex } from '@/core/policy/reflexes/line-of-sight'
import { SoftLandingReflex } from '@/core/policy/reflexes/soft-landing'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  name: string
  start: string
  end: string
  description: string
}

const SCENARIOS: Record<string, Scenario> = {
  tech: {
    name: 'tech',
    start: 'Jacquard machine',
    end: 'Central processing unit',
    description: 'The classic loom to computer evolution path',
  },
  revolution: {
    name: 'revolution',
    start: 'Coffee',
    end: 'French Revolution',
    description: 'From caffeine to guillotine',
  },
}

// ---------------------------------------------------------------------------
// 2. CLI
// ---------------------------------------------------------------------------

const program = new Command()
  .name('wikipedia-cyberloop')
  .description('Wikipedia navigation using cyberloop() wrapper')
  .option('-s, --scenario <key>', 'Scenario to run', 'tech')
  .parse()

const cliOpts = program.opts<{ scenario: string }>()

// ---------------------------------------------------------------------------
// 3. SteppableAgent
// ---------------------------------------------------------------------------

interface WikiResult extends AgentResult {
  path: string[]
  steps: number
  goalReached: boolean
}

async function createWikiAgent(
  scenario: Scenario,
  openai: OpenAI,
): Promise<{ agent: SteppableAgent<WikiState, string, WikiResult>; embedder: WikipediaEmbedder; goalEmbedding: number[] }> {
  const embedder = new WikipediaEmbedder(openai)

  // Embed goal
  logger.info('🧠 Embedding Goal...')
  const goalResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `Topic: ${scenario.end}`,
    encoding_format: 'float',
  })
  const goalEmbedding = goalResponse.data[0].embedding

  // Build policy stack (same as legacy cyberloop mode)
  const boredomGuard = new BoredomGuard<WikiState>(logger)
  const blacklistGuard = new BlacklistGuard<WikiState>()
  const reflexLineOfSight = new LineOfSightReflex<WikiState, WikiAction>({
    getLinks: (s) => s.links,
    getGoal: (s) => s.goal,
    createAction: (goal) => ({ type: 'NAVIGATE', title: goal }),
    logger,
  })
  const reflexSoftLanding = new SoftLandingReflex<WikiState, WikiAction>({
    embedder,
    goalEmbedding,
    createDoneAction: (reason) => ({ type: 'DONE', result: reason }),
    logger,
  })

  const basePolicy = new StochasticHeuristicPolicy(embedder, goalEmbedding)
  const chainPolicy = new ChainPolicy<WikiState, WikiAction, number>(
    basePolicy,
    [blacklistGuard, boredomGuard],
    [reflexLineOfSight, reflexSoftLanding],
  )

  const ladder = new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 })
  const env = new WikipediaEnv(scenario.start, scenario.end)

  let stepCount = 0

  const agent: SteppableAgent<WikiState, string, WikiResult> = {
    run(input: string): Promise<WikiResult> {
      return Promise.resolve({
        output: `Navigation: ${input}`,
        path: [],
        steps: 0,
        goalReached: false,
      })
    },

    async getInitialState(_input: string): Promise<WikiState> {
      const state = await env.observe()
      chainPolicy.initialize(state)
      stepCount = 0
      return state
    },

    async step(state: WikiState): Promise<StepOutput<WikiState>> {
      const action = await chainPolicy.decide(state, ladder)
      const nextState = await env.apply(action)
      stepCount++

      logger.info({
        step: stepCount,
        action: action.type,
        title: nextState.currentTitle,
        depth: nextState.depth,
        links: nextState.links.length,
      }, `[Step ${stepCount}] ${nextState.currentTitle}`)

      return {
        state: nextState,
        action,
        cost: 1,
      }
    },

    isDone(state: WikiState): boolean {
      return state.currentTitle === state.goal
    },

    toResult(state: WikiState): WikiResult {
      const goalReached = state.currentTitle === state.goal
      const path = [scenario.start, ...state.history]

      return {
        output: goalReached
          ? `✅ Reached "${state.goal}" in ${stepCount} steps!\nPath: ${path.join(' → ')}`
          : `❌ Did not reach "${state.goal}" after ${stepCount} steps.\nStopped at: ${state.currentTitle}\nPath: ${path.join(' → ')}`,
        path,
        steps: stepCount,
        goalReached,
      }
    },
  }

  return { agent, embedder, goalEmbedding }
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required in .env')
    process.exit(1)
  }

  const scenario = SCENARIOS[cliOpts.scenario]
  if (!scenario) {
    console.error(`❌ Unknown scenario: ${cliOpts.scenario}`)
    console.info(`Available: ${Object.keys(SCENARIOS).join(', ')}`)
    process.exit(1)
  }

  const logPath = setupBenchmarkLogger(scenario.name, 'cyberloop-wrapper')
  logger.info(`📝 Logging to: ${logPath}`)
  logger.info('🚀 Wikipedia Navigation — CyberLoop Wrapper')
  logger.info(`📖 Scenario: ${scenario.name} — ${scenario.description}`)
  logger.info(`🎯 Goal: ${scenario.start} → ${scenario.end}`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { agent, embedder, goalEmbedding } = await createWikiAgent(scenario, openai)

  // Wrap with cyberloop() + kinematicsMiddleware
  const wrapped = cyberloop<WikiState>(agent, {
    budget: { maxSteps: 50 },
    middleware: [
      kinematicsMiddleware<WikiState>({
        embedder: embedder as StateEmbedder<WikiState>,
        goalEmbedding,
        pid: { Kp: 0.5, Ki: 0.0, Kd: 0.1, stabilityThreshold: 0.6 },
        physics: { processNoise: 0.1, measureNoise: 0.5 },
        logger,
      }),
      telemetryMiddleware<WikiState>(logger),
    ],
    on: {
      onHalt(reason) {
        logger.info(`⛔ Halted: ${reason}`)
      },
    },
  })

  const result = await wrapped.run(`${scenario.start} -> ${scenario.end}`) as WikiResult

  logger.info('\n' + '='.repeat(80))
  logger.info('📊 Results:')
  logger.info('='.repeat(80))
  logger.info(result.output)
  logger.info(`🔄 Steps: ${result.steps}`)
  logger.info(`🎯 Goal reached: ${result.goalReached}`)
  logger.info('='.repeat(80))
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err))
})
