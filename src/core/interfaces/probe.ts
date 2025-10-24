import type { ProbeData, ProbeResult, State } from '../types'

/**
 * Probe performs a cheap, deterministic feasibility check before full execution.
 * Examples: hit count, distribution entropy, guard conditions.
 */
export interface Probe<S = State, D = ProbeData, R extends ProbeResult<D> = ProbeResult<D>> {
  id: string
  /** Optional declaration for routing & budgeting */
  capabilities?(): { cost?: number; supports?: string[] }
  /** Deterministic canary test. MUST be cheap. */
  test(state: S): Promise<R> | R
  /** Optional state inspection for debugging */
  inspectState?(state: S): Record<string, unknown>
}
