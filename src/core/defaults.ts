import type {
  BudgetTracker,
  Policy,
  Probe,
  StrategySelector,
  TerminationPolicy,
  FailureClassifier,
} from './interfaces'
import type { FailureType } from './types'

export { ProportionalLadder } from './ladder/proportional'
export { DeltaScoreEvaluator } from './evaluators/delta-score'
export { MultiBudget } from './budget/multi'

/** Tracks a finite total budget. Decrements each time `record()` is called. */
export class SimpleBudgetTracker implements BudgetTracker {
  private current: number
  constructor(private total: number) { this.current = total }
  record(cost: number | Record<string, number>): void {
    const amount = typeof cost === 'number'
      ? cost
      : Object.values(cost).reduce((sum, value) => sum + (value ?? 0), 0)
    this.current = Math.max(0, this.current - (amount || 0))
  }
  remaining(): number { return this.current }
  shouldStop(): boolean { return this.current <= 0 }
  reset(v?: number): void { this.current = v ?? this.total }
}

/** Simple rule-based selector that chooses the cheapest probe/policy pair. */
export class RuleBasedStrategySelector<S, A> implements StrategySelector<S, A> {
  select(input: {
    failure: FailureType
    ladderLevel: number
    budgetRemaining: number
    probes: Probe<S>[]
    policies: Policy<S, A>[]
  }): { probe: Probe<S>; policy: Policy<S, A> } {
    const { failure, ladderLevel, probes, policies } = input

    const sortedProbes = [...probes].sort(
      (a, b) => (a.capabilities?.()?.cost ?? 0) - (b.capabilities?.()?.cost ?? 0),
    )
    const probe =
      sortedProbes.find(p => p.capabilities?.()?.supports?.includes(failure)) ??
      sortedProbes[0]

    const inWindow = policies.filter(p => {
      const [min, max] = p.capabilities?.()?.explorationRange ?? [0, Infinity]
      return ladderLevel >= min && ladderLevel <= max
    })
    const candidates = inWindow.length ? inWindow : policies
    candidates.sort(
      (a, b) =>
        (a.capabilities?.()?.cost?.step ?? 1) -
        (b.capabilities?.()?.cost?.step ?? 1),
    )
    const policy = candidates[0]

    return { probe, policy }
  }
}

/** Probe that always passes (for quick experiments). */
export const CheapPassProbe = <S>(id = 'cheap-pass'): Probe<S> => ({
  id,
  capabilities: () => ({ cost: 0 }),
  test: () => ({ pass: true }),
})

/** Evaluator that returns a constant score; placeholder for real scoring logic. */
export class ThresholdEvaluator<S> {
  constructor(private threshold = 0) { }
  evaluate(_prev: S, _next: S): number {
    return 1 // always positive feedback for testing
  }
}

/** Stops the loop when budget is gone or improvements stall for too long. */
export class StagnationTerminationPolicy implements TerminationPolicy {
  constructor(private opts: { maxStagnantSteps?: number; minFeedback?: number } = {}) { }
  shouldStop(input: {
    t: number
    budgetRemaining: number
    noImprovementSteps: number
    lastFeedback?: number
  }): { stop: boolean; reason?: string } {
    if (input.budgetRemaining <= 0) {
      return { stop: true, reason: 'budget-exhausted' }
    }
    if (
      this.opts.maxStagnantSteps !== undefined &&
      input.noImprovementSteps >= this.opts.maxStagnantSteps
    ) {
      return { stop: true, reason: 'stagnation' }
    }
    if (
      this.opts.minFeedback !== undefined &&
      (input.lastFeedback ?? 0) <= this.opts.minFeedback
    ) {
      return { stop: true, reason: 'feedback-threshold' }
    }
    return { stop: false }
  }
}

/** Simple rule-based failure classifier using probe reasons and basic metrics. */
export class ReasonFailureClassifier<S, A> implements FailureClassifier<S, A> {
  constructor(
    private opts: {
      entropyHigh?: number
      entropyLow?: number
      sparseHits?: number
      denseHits?: number
    } = {},
  ) { }

  classify(input: {
    prev: S
    next?: S
    action?: A
    probeReason?: string
    metrics?: Record<string, unknown>
  }): FailureType {
    const reason = input.probeReason ?? ''
    const metrics = input.metrics ?? {}
    const hits = typeof metrics.hitCount === 'number' ? metrics.hitCount : undefined
    const entropy = typeof metrics.entropy === 'number' ? metrics.entropy : undefined
    const lastFeedback =
      typeof metrics.feedback === 'number' ? metrics.feedback : undefined

    if (/no[-\s]?hits|empty/i.test(reason) || hits === 0) return 'NoData'
    if (/rate[-\s]?limit/i.test(reason)) return 'RateLimited'
    if (/auth/i.test(reason)) return 'AuthDenied'
    if (/missing[-\s]?tool/i.test(reason)) return 'ToolMissing'
    if (/infeasible/i.test(reason)) return 'Infeasible'

    const entropyHigh = this.opts.entropyHigh ?? 0.85
    const entropyLow = this.opts.entropyLow ?? 0.2
    if (entropy !== undefined) {
      if (entropy > entropyHigh) return 'TooBroad'
      if (entropy < entropyLow) return 'TooNarrow'
    }

    const denseHits = this.opts.denseHits ?? 100
    const sparseHits = this.opts.sparseHits ?? 3
    if (hits !== undefined) {
      if (hits > denseHits) return 'TooBroad'
      if (hits > 0 && hits < sparseHits) return 'TooNarrow'
    }

    if (lastFeedback !== undefined && lastFeedback < 0) {
      return 'Unknown'
    }

    return 'Unknown'
  }
}
