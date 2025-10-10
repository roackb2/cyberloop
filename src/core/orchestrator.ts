import type {
  BudgetTracker,
  Environment,
  Evaluator,
  FailureClassifier,
  Ladder,
  Policy,
  Probe,
  StrategySelector,
  TerminationPolicy,
} from './interfaces'
import { controlLoop } from './loop'
import type { LoopEvents } from './runtime/events'
import type { Action, Cost, FailureType, Feedback, State } from './types'
import { withRetry } from './utils/retry'

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

interface RetryConfig {
  observe?: number
  probe?: number
  decide?: number
  apply?: number
  evaluate?: number
}

type TerminationDecision = ReturnType<TerminationPolicy['shouldStop']>

export interface OrchestratorOpts<S, A, F> {
  env: Environment<S, A>
  evaluator: Evaluator<S, F>
  ladder: Ladder<F>
  budget: BudgetTracker
  selector: StrategySelector<S, A>
  probes: Probe<S>[]
  policies: Policy<S, A, F>[]
  maxSteps?: number
  costOf?: (a: A) => Cost
  events?: LoopEvents<S, A, F>
  termination?: TerminationPolicy
  retry?: RetryConfig
  failureClassifier?: FailureClassifier<S, A>
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
  private readonly failureClassifier?: FailureClassifier<S, A>
  private readonly costOf?: OrchestratorOpts<S, A, F>['costOf']
  private readonly events?: LoopEvents<S, A, F>
  private readonly termination?: TerminationPolicy
  private readonly retry: RetryConfig

  public logs: StepLog<S, A, F>[] = []
  private noImprovementSteps = 0
  private bestNumericFeedback?: number
  private lastNumericFeedback?: number

  constructor(opts: OrchestratorOpts<S, A, F>) {
    this.env = opts.env
    this.evaluator = opts.evaluator
    this.ladder = opts.ladder
    this.budget = opts.budget
    this.selector = opts.selector
    this.probes = opts.probes
    this.policies = opts.policies
    this.maxSteps = opts.maxSteps ?? 50
    this.failureClassifier = opts.failureClassifier
    this.costOf = opts.costOf
    this.events = opts.events
    this.termination = opts.termination
    this.retry = opts.retry ?? {}
  }

  private recordCost(t: number, delta: Cost | undefined): void {
    if (delta === undefined) return
    const isZero = typeof delta === 'number'
      ? delta === 0
      : Object.values(delta).every(v => v === 0)
    if (isZero) return
    const before = this.budget.remaining()
    this.budget.record(delta)
    const after = this.budget.remaining()
    this.events?.onBudget?.({ t, delta, before, after })
  }

  async run(): Promise<{ final?: S; logs: StepLog<S, A, F>[] }> {
    this.logs = []
    this.noImprovementSteps = 0
    this.bestNumericFeedback = undefined
    this.lastNumericFeedback = undefined

    let stopReason: string | undefined
    let stopT = -1

    for (let t = 0; t < this.maxSteps; t++) {
      const res = await this.step(t)
      this.logs.push(res)
      this.updateProgress(res)

      if (this.budget.shouldStop()) {
        stopReason = 'budget-exhausted'
        stopT = res.t
        break
      }

      const termination = this.termination
      if (termination) {
        const decision: TerminationDecision = termination.shouldStop({
          t: res.t,
          budgetRemaining: this.budget.remaining(),
          noImprovementSteps: this.noImprovementSteps,
          lastFeedback: this.lastNumericFeedback,
        })
        if (decision.stop) {
          stopReason = decision.reason ?? 'termination'
          stopT = res.t
          break
        }
      }
    }

    if (!stopReason && this.logs.length === this.maxSteps) {
      stopReason = 'max-steps'
      stopT = this.logs[this.logs.length - 1]?.t ?? this.maxSteps - 1
    }

    if (stopReason) {
      this.events?.onStop?.({ t: stopT, reason: stopReason })
    }

    const last = this.logs[this.logs.length - 1]
    return { final: last?.next ?? last?.state, logs: this.logs }
  }

  private updateProgress(log: StepLog<S, A, F>): void {
    if (typeof log.score === 'number') {
      this.lastNumericFeedback = log.score
      if (
        this.bestNumericFeedback === undefined ||
        log.score > this.bestNumericFeedback
      ) {
        this.bestNumericFeedback = log.score
        this.noImprovementSteps = 0
      } else {
        this.noImprovementSteps += 1
      }
    } else if (this.lastNumericFeedback !== undefined) {
      this.noImprovementSteps += 1
    }

    if (log.failure) {
      this.noImprovementSteps += 1
    }
  }

  private classifyFailure(state: S, reason?: string): FailureType {
    if (this.failureClassifier) {
      return this.failureClassifier.classify({
        prev: state,
        probeReason: reason,
        metrics: { feedback: this.lastNumericFeedback },
      })
    }
    if (!reason) return 'Unknown'
    const normalized = reason.toLowerCase()
    if (normalized.includes('no-hits') || normalized.includes('no hits') || normalized.includes('empty')) {
      return 'NoData'
    }
    if (normalized.includes('too-many') || normalized.includes('overflow')) {
      return 'TooBroad'
    }
    if (normalized.includes('too-few') || normalized.includes('narrow')) {
      return 'TooNarrow'
    }
    if (normalized.includes('rate')) return 'RateLimited'
    if (normalized.includes('auth')) return 'AuthDenied'
    if (normalized.includes('tool')) return 'ToolMissing'
    if (normalized.includes('infeasible')) return 'Infeasible'
    return 'Unknown'
  }

  private async step(t: number): Promise<StepLog<S, A, F>> {
    const state = await withRetry(
      () => this.env.observe(),
      this.retry.observe ?? 0,
    )
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
      const result = await withRetry(
        () => currentProbe.test(state),
        this.retry.probe ?? 0,
      )
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
        this.classifyFailure(state, probeResult.reason)
      const previousProbe = probe
      const previousPolicy = policy
        // Reselect strategy based on failure type
        ; ({ probe, policy } = this.selector.select({
          failure,
          ladderLevel,
          budgetRemaining: this.budget.remaining(),
          probes: this.probes,
          policies: this.policies,
        }))
      if (
        (previousProbe.id !== probe.id) ||
        (previousPolicy.id !== policy.id)
      ) {
        this.events?.onStrategySwitch?.({
          t,
          from: `${previousProbe.id}:${previousPolicy.id}`,
          to: `${probe.id}:${policy.id}`,
          reason: failure,
        })
      }

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
          policyId: policy.id,
        }
        this.events?.onStep?.({
          t,
          state,
          failure,
          note: failureLog.note,
        })
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
      {
        state,
        retry: {
          decide: this.retry.decide,
          apply: this.retry.apply,
          evaluate: this.retry.evaluate,
        },
      },
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
    this.events?.onStep?.({
      t,
      state,
      action,
      next,
      feedback,
    })
    return log
  }
}
