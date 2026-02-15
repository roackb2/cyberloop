/**
 * Middleware Demo — Tier 2: Steppable Agent + Middleware
 *
 * A number-guessing agent that converges toward a target value.
 * Demonstrates how middleware composes: budget → evaluator → stagnation → telemetry.
 *
 * Run: yarn examples:middleware
 */

import { Command } from 'commander'

import type { AgentResult, StepOutput, SteppableAgent } from '@/core/agent-protocol'
import type { Middleware, StepContext, StepResult } from '@/core/middleware/types'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Define state and a steppable agent
// ---------------------------------------------------------------------------

interface GuessState {
  target: number
  guess: number
  step: number
  done: boolean
}

interface GuessResult extends AgentResult {
  finalGuess: number
  steps: number
}

/**
 * A simple agent that binary-searches toward a target number.
 * Each step, it adjusts its guess by half the remaining error.
 */
const guessingAgent: SteppableAgent<GuessState, string, GuessResult> = {
  run(input: string): Promise<GuessResult> {
    // Fallback for opaque mode — not used when wrapped with cyberloop()
    const target = parseInt(input, 10) || 42
    return Promise.resolve({ output: `Guessed ${target}`, finalGuess: target, steps: 1 })
  },

  getInitialState(input: string): Promise<GuessState> {
    const target = parseInt(input, 10) || 42
    return Promise.resolve({ target, guess: 0, step: 0, done: false })
  },

  step(state: GuessState): Promise<StepOutput<GuessState>> {
    const error = state.target - state.guess
    const adjustment = error * 0.5 // converge by half each step
    const newGuess = Math.round((state.guess + adjustment) * 100) / 100
    const done = Math.abs(error) < 0.5

    return Promise.resolve({
      state: { ...state, guess: newGuess, step: state.step + 1, done },
      action: { type: 'GUESS', value: newGuess, error },
      cost: 1,
    })
  },

  isDone(state: GuessState): boolean {
    return state.done
  },

  toResult(state: GuessState): GuessResult {
    return {
      output: `Converged to ${state.guess} in ${state.step} steps (target: ${state.target})`,
      finalGuess: state.guess,
      steps: state.step,
    }
  },

  // --- Trajectory<S> aliases ---
  advance(state: GuessState) { return this.step(state) },
  isTerminal(state: GuessState) { return this.isDone(state) },
  toOutput(state: GuessState) { return this.toResult(state) },
}

// ---------------------------------------------------------------------------
// 2. Custom middleware: logs each guess
// ---------------------------------------------------------------------------

function guessLoggerMiddleware(): Middleware<GuessState> {
  return {
    name: 'guess-logger',
    afterStep(_ctx: StepContext<GuessState>, result: StepResult<GuessState>): Promise<void> {
      const s = result.state
      const err = s.target - s.guess
      console.log(`  [Step ${s.step}] guess=${s.guess}, error=${err.toFixed(2)}, done=${s.done}`)
      return Promise.resolve()
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Parse CLI args and run
// ---------------------------------------------------------------------------

const program = new Command()
  .name('middleware-demo')
  .description('Steppable agent + middleware demo')
  .option('-t, --target <number>', 'Target number to guess', '42')
  .option('-s, --max-steps <number>', 'Max steps before budget halt', '20')
  .parse()

const opts = program.opts<{ target: string; maxSteps: string }>()
const target = opts.target
const maxSteps = parseInt(opts.maxSteps, 10)

const wrapped = cyberloop<GuessState>(guessingAgent, {
  budget: { maxSteps },
  middleware: [guessLoggerMiddleware()],
  on: {
    onHalt(reason) {
      console.log(`\n⛔ Halted: ${reason}`)
    },
  },
})

async function main() {
  console.log(`🎯 Middleware Demo — Guessing target=${target}, maxSteps=${maxSteps}\n`)

  const result = await wrapped.run(target) as GuessResult

  console.log(`\n✅ ${result.output}`)
  console.log(`   Final guess: ${result.finalGuess}`)
  console.log(`   Steps taken: ${result.steps}`)
}

await main().catch(console.error)
