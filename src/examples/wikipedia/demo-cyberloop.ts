/**
 * Revised Wikipedia Navigation — CyberLoop mode using cyberloop() wrapper
 *
 * ## Architecture Note: Inner-Loop Demo (No Real Agent)
 *
 * Unlike the quickstart or openai-agents-demo (which wrap a real LLM agent),
 * this demo has NO agent making decisions. Instead, each "step" is a
 * **deterministic inner-loop iteration**: the policy embeds Wikipedia link
 * candidates, ranks them by cosine similarity to the goal, and picks one.
 *
 * In the original 2-level architecture:
 *   - **Outer loop**: Planner (LLM) decides high-level strategy
 *   - **Inner loop**: Policy (deterministic/heuristic) executes search steps
 *
 * Here we only port the inner loop as a SteppableAgent. Each step() call:
 *   1. decideAction(state) — provided by policyMiddleware(), delegates to ChainPolicy:
 *      a. Reflexes (line-of-sight, soft-landing) — fast intercepts
 *      b. Guards (blacklist, boredom) — state modifiers
 *      c. Base policy (StochasticHeuristicPolicy) embeds candidates, ranks, selects
 *   2. WikipediaEnv applies the action (fetches next Wikipedia page)
 *
 * The cyberloop() middleware layer (budget, kinematics, telemetry) wraps around
 * these inner-loop steps, providing observation and control at the step boundary.
 *
 * ## Why guards/reflexes are inside step(), not middleware
 *
 * Guards and reflexes operate WITHIN the policy decision (they modify state or
 * intercept actions before the policy runs). Middleware operates AROUND the step
 * (beforeStep/afterStep). These are different abstraction levels:
 *   - Middleware: "before/after the agent acts" — budget, telemetry, kinematics
 *   - Guards/Reflexes: "before/during the policy decides" — blacklist, boredom
 *
 * policyMiddleware() lifts the ChainPolicy wiring into a declarative config,
 * returning a decideAction() function for use inside step() and a middleware
 * component for the cyberloop() chain.
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
import { policyMiddleware } from '@/core/middleware/policy'
import { telemetryMiddleware } from '@/core/middleware/telemetry'
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
): Promise<{ agent: SteppableAgent<WikiState, string, WikiResult>; middleware: ReturnType<typeof policyMiddleware<WikiState, WikiAction, number>>['middleware']; embedder: WikipediaEmbedder; goalEmbedding: number[] }> {
  const embedder = new WikipediaEmbedder(openai)

  // Embed goal
  logger.info('🧠 Embedding Goal...')
  const goalResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `Topic: ${scenario.end}`,
    encoding_format: 'float',
  })
  const goalEmbedding = goalResponse.data[0].embedding

  // -----------------------------------------------------------------------
  // Policy stack — wired via policyMiddleware()
  //
  // policyMiddleware() constructs a ChainPolicy internally and returns:
  //   - middleware: handles initialization reset and metadata tracking
  //   - decideAction(state): call inside step() to get the policy's action
  //
  // Execution order inside decideAction() (delegated to ChainPolicy):
  //   1. Reflexes (fast path — can intercept and skip policy entirely):
  //      - LineOfSightReflex: if goal is in current page's links, navigate directly
  //      - SoftLandingReflex: if semantically very close to goal, declare done
  //   2. Guards (modify state before policy sees it):
  //      - BlacklistGuard: filters out previously-visited/bad links
  //      - BoredomGuard: penalizes recently-seen topics to encourage exploration
  //   3. Base policy (StochasticHeuristicPolicy):
  //      - Embeds top 50 link candidates via OpenAI embeddings API
  //      - Ranks by cosine similarity to goal embedding
  //      - Stochastically selects from top 3
  // -----------------------------------------------------------------------
  const { middleware: policyMw, decideAction } = policyMiddleware<WikiState, WikiAction, number>({
    basePolicy: new StochasticHeuristicPolicy(embedder, goalEmbedding),
    guards: [
      new BlacklistGuard<WikiState>(),
      new BoredomGuard<WikiState>(logger),
    ],
    reflexes: [
      new LineOfSightReflex<WikiState, WikiAction>({
        getLinks: (s) => s.links,
        getGoal: (s) => s.goal,
        createAction: (goal) => ({ type: 'NAVIGATE', title: goal }),
        logger,
      }),
      new SoftLandingReflex<WikiState, WikiAction>({
        embedder,
        goalEmbedding,
        createDoneAction: (reason) => ({ type: 'DONE', result: reason }),
        logger,
      }),
    ],
    ladder: new ProportionalLadder({ gainUp: 0.2, gainDown: 0.2, max: 3 }),
  })

  const env = new WikipediaEnv(scenario.start, scenario.end)

  let stepCount = 0

  const agent: SteppableAgent<WikiState, string, WikiResult> = {
    // Opaque fallback — not used when cyberloop() detects SteppableAgent
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
      stepCount = 0
      return state
    },

    // Each step IS one inner-loop iteration:
    //   decideAction(state) → reflexes → guards → base policy → action
    //   env.apply(action) → fetch next Wikipedia page → new state
    //
    // cyberloop() middleware (budget, kinematics, telemetry, policy) wraps
    // around this entire step, running beforeStep/afterStep hooks.
    async step(state: WikiState): Promise<StepOutput<WikiState>> {
      const action = await decideAction(state)
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

    // --- Trajectory<S> aliases ---
    advance(state: WikiState) { return this.step(state) },
    isTerminal(state: WikiState) { return this.isDone(state) },
    toOutput(state: WikiState) { return this.toResult(state) },
  }

  return { agent, middleware: policyMw, embedder, goalEmbedding }
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
  const { agent, middleware: policyMw, embedder, goalEmbedding } = await createWikiAgent(scenario, openai)

  // Wrap with cyberloop() — middleware operates at the step boundary:
  //   beforeStep → [step: decideAction + env] → afterStep
  //
  // policyMw: tracks policy actions in metadata, feeds ladder on feedback
  // kinematicsMiddleware: embeds state each step, tracks semantic drift via
  //   EKF (position/velocity/heading), runs PID controller for corrections
  // telemetryMiddleware: structured logging of step lifecycle
  // budget: hard limit on total steps (prevents infinite navigation)
  const wrapped = cyberloop<WikiState>(agent, {
    budget: { maxSteps: 50 },
    middleware: [
      policyMw,
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
