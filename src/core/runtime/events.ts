import type { Policy, Probe } from '../interfaces'
import type { Cost } from '../types'

/**
 * Loop event hooks allow adapters and visualizers to subscribe to runtime signals
 * without mutating core orchestrator logic.
 */
export interface LoopEvents<S, A, F> {
  onProbeStart?(event: { t: number; state: S; probe: Probe<S>; attempt: number }): void
  onProbeResult?(event: {
    t: number
    state: S
    probe: Probe<S>
    attempt: number
    result: Awaited<ReturnType<Probe<S>['test']>>
  }): void
  onAction?(event: {
    t: number
    state: S
    action: A
    next: S
    feedback: F
    policy: Policy<S, A, F>
  }): void
  onStep?(event: {
    t: number
    state: S
    action?: A
    next?: S
    feedback?: F
    failure?: string
    note?: string
  }): void
  onBudget?(event: { t: number; delta: Cost; before: number; after: number }): void
  onStop?(event: { t: number; reason: string }): void
  onStrategySwitch?(event: { t: number; from: string; to: string; reason: string }): void
}
