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
  policyId?: string
  probeId?: string
}

export interface OrchestratorEvents<S, A, F> {
  onProbeStart?(info: { t: number; state: S; probe: Probe<S>; attempt: number }): void
  onProbeResult?(info: {
    t: number
    state: S
    probe: Probe<S>
    attempt: number
    result: Awaited<ReturnType<Probe<S>['test']>>
  }): void
  onAction?(info: {
    t: number
    state: S
    action: A
    next: S
    feedback: F
    policy: Policy<S, A, F>
  }): void
  onStep?(log: StepLog<S, A, F>): void
  onBudget?(info: { t: number; delta: number; before: number; after: number }): void
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
  events?: OrchestratorEvents<S, A, F>
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
  private readonly events?: OrchestratorEvents<S, A, F>

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
    this.events = opts.events
  }

  private recordCost(t: number, delta: number): void {
    if (!delta) return
    const before = this.budget.remaining()
    this.budget.record(delta)
    const after = this.budget.remaining()
    this.events?.onBudget?.({ t, delta, before, after })
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
    const initialBudget = this.budget.remaining()

    // 1. Select probe & policy (initially assume unknown failure)
    let { probe, policy } = this.selector.select({
      failure: 'Unknown',
      ladderLevel,
      budgetRemaining: initialBudget,
      probes: this.probes,
      policies: this.policies,
    })

    const runProbe = async (
      currentProbe: Probe<S>,
      attempt: number,
    ): Promise<Awaited<ReturnType<Probe<S>['test']>>> => {
      this.events?.onProbeStart?.({ t, state, probe: currentProbe, attempt })
      const result = await currentProbe.test(state)
      this.events?.onProbeResult?.({ t, state, probe: currentProbe, attempt, result })
      const probeCost = currentProbe.capabilities?.()?.cost ?? 0
      this.recordCost(t, probeCost)
      return result
    }

    // 2. Run cheap deterministic probe(s)
    let attempt = 1
    let probeResult = await runProbe(probe, attempt)

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

      attempt += 1
      const probeResult2 = await runProbe(probe, attempt)
      if (!probeResult2.pass || this.budget.shouldStop()) {
        const failureLog: StepLog<S, A, F> = {
          t,
          state,
          failure,
          ladderLevel: this.ladder.level(),
          budgetRemaining: this.budget.remaining(),
          note: probeResult2.reason ?? 'probe-not-passed',
          probeId: probe.id,
        }
        this.events?.onStep?.(failureLog)
        return failureLog
      }
      probeResult = probeResult2
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
    this.recordCost(t, aCost)
    this.events?.onAction?.({ t, state, action, next, feedback, policy })

    const log: StepLog<S, A, F> = {
      t,
      state,
      action,
      next,
      score: typeof feedback === 'number' ? feedback : undefined,
      ladderLevel: this.ladder.level(),
      budgetRemaining: this.budget.remaining(),
      feedback,
      policyId: policy.id,
      probeId: probe.id,
    }
    this.events?.onStep?.(log)
    return log
  }
}
