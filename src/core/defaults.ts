import type {
  BudgetTracker,
  Ladder,
  Policy,
  Probe,
  StrategySelector,
} from './interfaces'
import type { FailureType } from './types'

/** Tracks a finite total budget. Decrements each time `record()` is called. */
export class SimpleBudgetTracker implements BudgetTracker {
  private current: number
  constructor(private total: number) { this.current = total }
  record(cost: number): void { this.current = Math.max(0, this.current - (cost || 0)) }
  remaining(): number { return this.current }
  shouldStop(): boolean { return this.current <= 0 }
  reset(v?: number): void { this.current = v ?? this.total }
}

/** Ladder that increases or decreases linearly according to feedback. */
export class ProportionalLadder implements Ladder<number> {
  private lv = 0
  constructor(private opts: { gainUp?: number; gainDown?: number; max?: number } = {}) { }
  update(feedback: number): void {
    const up = this.opts.gainUp ?? 0.5
    const down = this.opts.gainDown ?? 0.5
    if (feedback >= 0) this.lv = Math.min((this.opts.max ?? 3), this.lv + up * feedback)
    else this.lv = Math.max(0, this.lv + down * feedback)
  }
  level(): number { return this.lv }
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
