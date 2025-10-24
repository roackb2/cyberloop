/**
 * Reference Implementations for Optional Meta-Control Components
 *
 * This module provides example implementations of optional AICL interfaces.
 * These are educational examples showing how to implement advanced meta-control
 * components like StrategySelector, FailureClassifier, and TerminationPolicy.
 *
 * ## When to use these
 *
 * Most applications DON'T need these components. They're for advanced scenarios:
 * - Multi-strategy routing across different domains
 * - Complex failure diagnosis and recovery
 * - Multi-objective termination criteria
 *
 * ## Recommended approach
 *
 * Instead of using these generic implementations, create domain-specific components
 * tailored to your use case. See `src/adapters/github` for the recommended pattern:
 * - Custom ProbePolicy (DeterministicSearchPolicy)
 * - Domain-specific probes (hasHitsProbe, dropGuardProbe, entropyGuardProbe)
 * - Simple evaluators and ladders from core/
 *
 * ## What's in this module
 *
 * - SimpleBudgetTracker - Basic budget tracking (use ControlBudget instead)
 * - RuleBasedStrategySelector - Multi-strategy routing example
 * - CheapPassProbe - No-op probe for testing
 * - ThresholdEvaluator - Placeholder evaluator for testing
 * - StagnationTerminationPolicy - Multi-objective stopping criteria
 * - ReasonFailureClassifier - Rule-based failure diagnosis
 */

import type {
  BudgetTracker,
  FailureClassifier,
  Policy,
  Probe,
  StrategySelector,
  TerminationPolicy,
} from '../core/interfaces'
import type { FailureType } from '../core/types'

/**
 * Reference implementation: Simple budget tracker.
 * Tracks a finite total budget. Decrements each time `record()` is called.
 * Note: Production code should use ControlBudget for hierarchical inner/outer loop tracking.
 */
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

/**
 * Reference implementation: Rule-based strategy selector.
 * Optional meta-control component for multi-strategy routing.
 * Chooses the cheapest probe/policy pair based on failure type and ladder level.
 * Most applications use a single policy and don't need this.
 */
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

/**
 * Reference implementation: No-op probe for testing.
 * Always passes with zero cost. Useful for quick experiments and testing.
 */
export const CheapPassProbe = <S>(id = 'cheap-pass'): Probe<S> => ({
  id,
  capabilities: () => ({ cost: 0 }),
  test: () => ({ pass: true }),
})

/**
 * Reference implementation: Constant-score evaluator.
 * Placeholder for testing. Production code should implement domain-specific evaluation logic.
 */
export class ThresholdEvaluator<S> {
  constructor(private threshold = 0) { }
  evaluate(_prev: S, _next: S): number {
    return 1 // always positive feedback for testing
  }
}

/**
 * Reference implementation: Stagnation-based termination policy.
 * Optional meta-control component for complex stopping criteria.
 * Stops when budget exhausted or improvements stall.
 * Most applications use ControlBudget's built-in termination.
 */
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

/**
 * Reference implementation: Rule-based failure classifier.
 * Optional meta-control component for diagnosing complex failure modes.
 * Classifies failures based on probe reasons and metrics (entropy, hit counts, etc.).
 * Most applications handle failures directly in their ProbePolicy.
 */
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
