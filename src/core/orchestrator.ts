import type {
  BudgetTracker,
  Environment,
  Evaluator,
  Ladder,
  Policy,
  Probe,
  StrategySelector,
} from './interfaces'
import { controlLoop } from './loop'
import type { Action, Cost, FailureType, Feedback, Signal, State } from './types'

export interface StepLog<S, A, F> {
  t: number
  state: S
  action?: A
  next?: S
  score?: number
  failure?: FailureType
  ladderLevel: number
  budgetRemaining: number
  note?: string
  feedback?: F
}

export interface OrchestratorOpts<S, A, F> {
  env: Environment<S, A>
  evaluator: Evaluator<S, F>
  ladder: Ladder<F>
  budget: BudgetTracker
  selector: StrategySelector<S, A>
  probes: Probe<S>[]
  policies: Policy<S, A, F>[]
  maxSteps?: number
  classify?: (args: {
    state: S
    action?: A
    next?: S
    probeReason?: string
    signal?: Signal
  }) => FailureType
  costOf?: (a: A) => Cost
}

/**
 * Main control orchestrator that coordinates Environment, Policy,
 * Evaluator, Ladder, Probes, and Budget within one loop.
 */
export class Orchestrator<S = State, A = Action, F = Feedback> {
  private readonly env: Environment<S, A>
  private readonly evaluator: Evaluator<S, F>
  private readonly ladder: Ladder<F>
  private readonly budget: BudgetTracker
  private readonly selector: StrategySelector<S, A>
  private readonly probes: Probe<S>[]
  private readonly policies: Policy<S, A, F>[]
  private readonly maxSteps: number
  private readonly classify?: OrchestratorOpts<S, A, F>['classify']
  private readonly costOf?: OrchestratorOpts<S, A, F>['costOf']

  public logs: StepLog<S, A, F>[] = []

  constructor(opts: OrchestratorOpts<S, A, F>) {
    this.env = opts.env
    this.evaluator = opts.evaluator
    this.ladder = opts.ladder
    this.budget = opts.budget
    this.selector = opts.selector
    this.probes = opts.probes
    this.policies = opts.policies
    this.maxSteps = opts.maxSteps ?? 50
    this.classify = opts.classify
    this.costOf = opts.costOf
  }

  async run(): Promise<{ final?: S; logs: StepLog<S, A, F>[] }> {
    for (let t = 0; t < this.maxSteps; t++) {
      const res = await this.step(t)
      this.logs.push(res)
      if (this.budget.shouldStop()) break
    }
    const last = this.logs[this.logs.length - 1]
    return { final: last?.next ?? last?.state, logs: this.logs }
  }

  private async step(t: number): Promise<StepLog<S, A, F>> {
    const state = await this.env.observe()
    const ladderLevel = this.ladder.level()
    const budgetRemaining = this.budget.remaining()

    // 1. Select probe & policy (initially assume unknown failure)
    let { probe, policy } = this.selector.select({
      failure: 'Unknown',
      ladderLevel,
      budgetRemaining,
      probes: this.probes,
      policies: this.policies,
    })

    // 2. Run cheap deterministic probe
    const probeResult = await probe.test(state)
    const probeCost = probe.capabilities?.()?.cost ?? 0
    if (probeCost) this.budget.record(probeCost)

    if (!probeResult.pass) {
      const failure =
        this.classify?.({ state, probeReason: probeResult.reason }) ?? 'Unknown'
        // Reselect strategy based on failure type
        ; ({ probe, policy } = this.selector.select({
          failure,
          ladderLevel,
          budgetRemaining: this.budget.remaining(),
          probes: this.probes,
          policies: this.policies,
        }))

      const probeResult2 = await probe.test(state)
      const probeCost2 = probe.capabilities?.()?.cost ?? 0
      if (probeCost2) this.budget.record(probeCost2)
      if (!probeResult2.pass || this.budget.shouldStop()) {
        return {
          t,
          state,
          failure,
          ladderLevel: this.ladder.level(),
          budgetRemaining: this.budget.remaining(),
          note: probeResult2.reason ?? 'probe-not-passed',
        }
      }
    }

    // 3. Run pure control kernel (observe/decide/act/evaluate/adapt)
    const { action, next, feedback } = await controlLoop<S, A, F>(
      this.env,
      this.evaluator,
      policy,
      this.ladder,
      { state },
    )
    const aCost = this.costOf?.(action) ?? (policy.capabilities?.()?.cost?.step ?? 1)
    if (aCost) this.budget.record(aCost)
    let score: number | undefined
    if (typeof feedback === 'number') score = feedback

    return {
      t,
      state,
      action,
      next,
      score,
      ladderLevel: this.ladder.level(),
      budgetRemaining: this.budget.remaining(),
      feedback,
    }
  }
}
