import type { BudgetTracker } from '../interfaces/budget-tracker'
import type { Cost } from '../types'

/**
 * ControlBudget - Hierarchical budget for inner/outer control loops
 * 
 * Separates cheap operations (inner loop: probes, local adjustments)
 * from expensive operations (outer loop: LLM calls, planning).
 * 
 * Inspired by hierarchical control theory where fast inner loops
 * operate at high frequency with low cost, while slow outer loops
 * provide strategic guidance at low frequency with high cost.
 */
export interface ControlBudget {
  /** Inner loop budget - cheap, high-frequency operations */
  innerLoop: BudgetTracker
  
  /** Outer loop budget - expensive, low-frequency operations */
  outerLoop: BudgetTracker
  
  /** Check if any budget is exhausted */
  shouldStop(): boolean
}

/**
 * Simple implementation of ControlBudget
 */
export class SimpleControlBudget implements ControlBudget {
  constructor(
    public innerLoop: BudgetTracker,
    public outerLoop: BudgetTracker,
  ) {}

  shouldStop(): boolean {
    return this.innerLoop.shouldStop() || this.outerLoop.shouldStop()
  }
}

/**
 * Create a control budget with specified initial values
 */
export function createControlBudget(
  innerLoopBudget: Cost,
  outerLoopBudget: Cost,
): ControlBudget {
  return new SimpleControlBudget(
    createSimpleBudget(innerLoopBudget),
    createSimpleBudget(outerLoopBudget),
  )
}

/**
 * Simple budget tracker implementation
 */
function createSimpleBudget(initial: Cost): BudgetTracker {
  let current = typeof initial === 'number' ? initial : 0

  return {
    record(cost: Cost): void {
      const costValue = typeof cost === 'number' ? cost : 0
      current -= costValue
    },
    remaining(): number {
      return current
    },
    shouldStop(): boolean {
      return current <= 0
    },
    reset(value?: Cost): void {
      current = typeof value === 'number' ? value : (typeof initial === 'number' ? initial : 0)
    },
  }
}
