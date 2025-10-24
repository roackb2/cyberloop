/**
 * Shared generic type aliases used across core interfaces.
 * These are intentionally minimal so adapters can override with domain types.
 */
export type State = unknown
export type Action = unknown
export type Feedback = unknown
export type ProbeData = unknown
export interface ProbeResult<D = ProbeData> {
  pass: boolean
  reason?: string
  data?: D
}

/**
 * AggregateProbeResult - Result of combining multiple probe tests
 * Framework guarantees the base structure, users can extend with additional fields
 */
export interface AggregateProbeResult<D = ProbeData, R extends ProbeResult<D> = ProbeResult<D>> {
  pass: boolean
  reason?: string
  /** Array of individual probe results */
  results: R[]
}
export type Cost = number | Record<string, number>

/** Failure categories for StrategySelector / FailureClassifier */
export type FailureType =
  | 'Unknown'
  | 'NoData'
  | 'TooNarrow'
  | 'TooBroad'
  | 'AuthDenied'
  | 'RateLimited'
  | 'ToolMissing'
  | 'Infeasible'

/** Optional meta signal passed between modules (entropy, drift, coverage, etc.) */
export type Signal = Record<string, unknown>
