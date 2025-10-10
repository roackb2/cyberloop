import type { FailureType } from '../types'

export interface FailureClassifier<S, A> {
  classify(input: {
    prev: S
    next?: S
    action?: A
    probeReason?: string
    metrics?: Record<string, unknown>
  }): FailureType
}
