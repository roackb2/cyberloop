/**
 * CyberLoop - Artificial Intelligence Control Loop (AICL) Framework
 *
 * A control-theoretic framework for building sustainable, self-correcting intelligence.
 * Implements hierarchical inner/outer loop architecture with bounded resource control.
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Framework
// ============================================================================

/** Main orchestrator for hierarchical control loops */
export type {
  ExplorationResult,
  OrchestratorOpts,
  OrchestratorResult,
  StepLog,
} from './core/orchestrator'
export { Orchestrator } from './core/orchestrator'

// ============================================================================
// Core Interfaces (AICL Architecture)
// ============================================================================

export type {
  // Budget and resource control
  BudgetTracker,
  // Primary control interfaces
  Environment,
  Evaluator,
  FailureClassifier,
  Ladder,
  Planner,
  Policy,
  Probe,
  ProbePolicy,
  StrategySelector,
  TerminationPolicy,
} from './core/interfaces'

// ============================================================================
// Core Types
// ============================================================================

export type {
  Action,
  Cost,
  FailureType,
  Feedback,
  ProbeResult,
  Signal,
  State,
} from './core/types'

// ============================================================================
// Default Implementations
// ============================================================================

export {
  // Utilities
  CheapPassProbe,
  // Evaluators
  DeltaScoreEvaluator,
  // Budget trackers
  MultiBudget,
  // Ladder implementations
  ProportionalLadder,
  // Strategy and control
  ReasonFailureClassifier,
  RuleBasedStrategySelector,
  SimpleBudgetTracker,
  StagnationTerminationPolicy,
  ThresholdEvaluator,
} from './core/defaults'

// ============================================================================
// Built-in Probes
// ============================================================================

export { EntropyProbe, HitCountProbe } from './core/probes'

// ============================================================================
// Budget Implementations
// ============================================================================

export type { ControlBudget } from './core/budget/control-budget'
export { createControlBudget } from './core/budget/control-budget'

// ============================================================================
// Domain Adapters (Optional - users can import if needed)
// ============================================================================

// GitHub adapter - for GitHub search use cases
export * as GitHub from './adapters/github'
