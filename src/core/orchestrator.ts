import type { ControlBudget } from './budget/control-budget'
import type {
  Environment,
  Evaluator,
  Ladder,
  Planner,
  Probe,
  ProbePolicy,
} from './interfaces'
import type { Action, Feedback, ProbeResult, State } from './types'

/**
 * ExplorationResult - Result of inner loop exploration
 */
export interface ExplorationResult<S> {
  status: 'stable' | 'budget-exhausted'
  state: S
  history: S[]
  probeResults: ProbeResult[]
}

/**
 * StepLog - Log entry for each inner loop iteration
 */
export interface StepLog<S, A, F> {
  t: number
  state: S
  action?: A
  next?: S
  feedback?: F
  ladderLevel: number
  innerBudgetRemaining: number
  probeResult?: ProbeResult
  isStable: boolean
}

/**
 * OrchestratorResult - Final result from orchestrator
 */
export interface OrchestratorResult<S, A, F> {
  output: string
  explorationAttempts: number
  innerLoopSteps: number
  outerLoopCalls: number
  logs: StepLog<S, A, F>[]
}

/**
 * OrchestratorOpts - Configuration for orchestrator
 */
export interface OrchestratorOpts<S, A, F> {
  env: Environment<S, A>
  probePolicy: ProbePolicy<S, A, F>
  planner: Planner<S>
  probes: Probe<S>[]
  evaluator: Evaluator<S, F>
  ladder: Ladder<F>
  budget: ControlBudget
  maxInnerSteps?: number
}

/**
 * Orchestrator - Hierarchical control loop with inner/outer loops
 * 
 * Architecture:
 * - Inner loop: Fast, reflexive control using ProbePolicy
 * - Outer loop: Slow, strategic control using Planner
 * 
 * Flow:
 * 1. Planner creates initial plan from user input (outer loop call #1)
 * 2. Inner loop explores deterministically until stable or budget exhausted
 * 3. If stable: Planner evaluates results (outer loop call #2)
 * 4. If budget exhausted: Planner replans (outer loop call #3), goto step 2
 * 5. Return final output
 */
export class Orchestrator<S = State, A = Action, F = Feedback> {
  private readonly env: Environment<S, A>
  private readonly probePolicy: ProbePolicy<S, A, F>
  private readonly planner: Planner<S>
  private readonly probes: Probe<S>[]
  private readonly evaluator: Evaluator<S, F>
  private readonly ladder: Ladder<F>
  private readonly budget: ControlBudget
  private readonly maxInnerSteps: number

  public logs: StepLog<S, A, F>[] = []

  constructor(opts: OrchestratorOpts<S, A, F>) {
    this.env = opts.env
    this.probePolicy = opts.probePolicy
    this.planner = opts.planner
    this.probes = opts.probes
    this.evaluator = opts.evaluator
    this.ladder = opts.ladder
    this.budget = opts.budget
    this.maxInnerSteps = opts.maxInnerSteps ?? 50
  }

  /**
   * Run the orchestrator with user input
   * 
   * @param userInput - User's natural language input
   * @returns Final output and statistics
   */
  async run(userInput: string): Promise<OrchestratorResult<S, A, F>> {
    this.logs = []
    let explorationAttempts = 0
    let innerLoopSteps = 0
    let outerLoopCalls = 0

    // Outer loop call #1: Initial planning
    console.log('\n[Outer Loop] Calling planner.plan()...')
    let state = await this.planner.plan(userInput)
    console.log(`[Outer Loop] Initial state: ${JSON.stringify(state)}`)
    outerLoopCalls++
    this.budget.outerLoop.record(2.0) // Cost of LLM call

    // Initialize probe policy with initial state
    this.probePolicy.initialize(state)
    console.log('[Outer Loop] ProbePolicy initialized\n')

    // Main control loop
    while (!this.budget.shouldStop()) {
      explorationAttempts++

      // Inner loop: Deterministic exploration
      const result = await this.exploreInnerLoop(state)
      innerLoopSteps += result.history.length

      if (result.status === 'stable') {
        // Success! Outer loop call #2: Evaluate results
        console.log('\n[Outer Loop] Stable state found! Calling planner.evaluate()...')
        const output = await this.planner.evaluate(result.state, result.history)
        outerLoopCalls++
        this.budget.outerLoop.record(2.0)

        return {
          output,
          explorationAttempts,
          innerLoopSteps,
          outerLoopCalls,
          logs: this.logs,
        }
      }

      if (result.status === 'budget-exhausted' && !this.budget.outerLoop.shouldStop()) {
        // Inner loop exhausted, try replanning
        // Outer loop call #3: Replan
        console.log('\n[Outer Loop] Inner loop exhausted. Calling planner.replan()...')
        const newState = await this.planner.replan(result.state, result.history)
        outerLoopCalls++
        this.budget.outerLoop.record(2.0)

        if (newState) {
          state = newState
          this.probePolicy.initialize(newState)
          // Reset inner loop budget for new attempt
          this.budget.innerLoop.reset?.()
          continue
        }
      }

      // Can't replan or outer budget exhausted
      break
    }

    // Fallback: Return best effort result
    return {
      output: 'Exploration exhausted without finding stable solution',
      explorationAttempts,
      innerLoopSteps,
      outerLoopCalls,
      logs: this.logs,
    }
  }

  /**
   * Inner loop: Fast, deterministic exploration
   * 
   * Uses ProbePolicy to make quick adjustments based on probe signals
   * until state is stable or inner loop budget exhausted.
   */
  private async exploreInnerLoop(initialState: S): Promise<ExplorationResult<S>> {
    let state = initialState
    const history: S[] = [state]
    const probeResults: ProbeResult[] = []

    for (let t = 0; t < this.maxInnerSteps && !this.budget.innerLoop.shouldStop(); t++) {
      // Run probes to get gradient signals
      const probeResult = await this.runProbes(state)
      probeResults.push(probeResult)
      this.budget.innerLoop.record(0.05) // Cheap probe cost

      // Check if state is stable (good enough)
      const isStable = this.probePolicy.isStable(state)
      
      // Log this step
      this.logs.push({
        t,
        state,
        ladderLevel: this.ladder.level(),
        innerBudgetRemaining: this.budget.innerLoop.remaining(),
        probeResult,
        isStable,
      })

      // Debug logging
      console.log(`[Inner Loop t=${t}] state=${JSON.stringify(state)}, stable=${isStable}, budget=${this.budget.innerLoop.remaining().toFixed(2)}`)

      if (isStable) {
        return {
          status: 'stable',
          state,
          history,
          probeResults,
        }
      }

      // Probe policy decides next action (deterministic, no LLM!)
      const action = await this.probePolicy.decide(state, this.ladder)
      console.log(`[Inner Loop t=${t}] Action: ${JSON.stringify(action)}`)
      this.budget.innerLoop.record(0.1) // Cheap decision cost

      // Apply action to environment
      const nextState = await this.env.apply(action)
      
      // Evaluate and update ladder
      const feedback = await this.evaluator.evaluate(state, nextState)
      this.ladder.update(feedback)

      // Update policy (optional adaptation)
      this.probePolicy.adapt?.(feedback, this.ladder)

      // Update log with action and feedback
      const lastLog = this.logs[this.logs.length - 1]
      if (lastLog) {
        lastLog.action = action
        lastLog.next = nextState
        lastLog.feedback = feedback
      }

      state = nextState
      history.push(state)
    }

    return {
      status: 'budget-exhausted',
      state,
      history,
      probeResults,
    }
  }

  /**
   * Run all probes and combine results
   */
  private async runProbes(state: S): Promise<ProbeResult> {
    const results = await Promise.all(
      this.probes.map(probe => Promise.resolve(probe.test(state)))
    )

    // Combine probe results (simple strategy: fail if any fails)
    const allPass = results.every(r => r.pass)
    const reasons = results.filter(r => !r.pass).map(r => r.reason).filter(Boolean)

    return {
      pass: allPass,
      reason: reasons.join(', ') || undefined,
      data: results,
    }
  }
}
