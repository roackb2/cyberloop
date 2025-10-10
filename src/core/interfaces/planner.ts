import type { State } from '../types'

/**
 * Planner - Strategic planning and replanning (outer control loop)
 * 
 * Part of the outer control loop. Makes expensive, deliberative decisions
 * using LLM or other reasoning systems.
 * 
 * Inspired by:
 * - Agentic systems: High-level planning
 * - Control theory: Slow outer loop / supervisory control
 * - Hierarchical control: Strategic layer above reactive layer
 * 
 * @template S - State type
 */
export interface Planner<S = State> {
  /**
   * Create initial plan from user input
   * Called once at the start to initialize exploration
   * 
   * Example: Convert "node graceful shutdown" into SearchFilters
   * 
   * @param input - User's natural language input
   * @returns Initial state to begin exploration
   */
  plan(input: string): Promise<S>

  /**
   * Evaluate exploration results and produce final output
   * Called when exploration finds a stable state
   * 
   * Example: Summarize found repositories into recommendations
   * 
   * @param state - Final state after successful exploration
   * @param history - History of states during exploration
   * @returns Final output for user (e.g., summary, recommendations)
   */
  evaluate(state: S, history: S[]): Promise<string>

  /**
   * Replan when exploration fails or gets stuck
   * Called when exploration budget exhausted without finding stable state
   * 
   * Example: Suggest completely different search strategy
   * 
   * @param state - Current state where exploration failed
   * @param history - History of states during failed exploration
   * @returns New initial state to try different strategy, or null if can't replan
   */
  replan(state: S, history: S[]): Promise<S | null>
}
