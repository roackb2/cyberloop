import type { ProbeResult, State } from '../types'

/**
 * Probe performs a cheap, deterministic feasibility check before full execution.
 * Examples: hit count, distribution entropy, guard conditions.
 */
export interface Probe<S = State, R extends ProbeResult = ProbeResult> {
  id: string
  /** Optional declaration for routing & budgeting */
  capabilities?(): { cost?: number; supports?: string[] }
  /** Deterministic canary test. MUST be cheap. */
  test(state: S): Promise<R> | R
}
