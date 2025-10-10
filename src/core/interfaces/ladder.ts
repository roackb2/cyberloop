import type { Feedback } from '../types'

/**
 * Ladder is the internal gradient that regulates exploration intensity.
 * Implementations should be pure and small-state to keep control stable.
 */
export interface Ladder<F = Feedback> {
  /** Update internal level from feedback */
  update(feedback: F): void
  /** Current ladder level (e.g., 0..1 or discrete stage index) */
  level(): number
}
