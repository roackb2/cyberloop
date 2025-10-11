import type { FailureType } from '../types'

/**
 * FailureClassifier categorizes failures into types for routing decisions.
 * 
 * NOTE: Currently not used in Inner/Outer Loop architecture.
 * ProbePolicy directly examines state instead of classifying failures.
 * Kept for future scenarios with complex failure modes (e.g., distributed system debugging).
 * See docs/implementation/unused-interfaces.md for details.
 */
export interface FailureClassifier<S, A> {
  classify(input: {
    prev: S
    next?: S
    action?: A
    probeReason?: string
    metrics?: Record<string, unknown>
  }): FailureType
}
