/**
 * Shared generic type aliases used across core interfaces.
 * These are intentionally minimal so adapters can override with domain types.
 */
export type State = unknown
export type Action = unknown
export type Feedback = unknown
export interface ProbeResult { 
  pass: boolean
  reason?: string
  data?: unknown
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
