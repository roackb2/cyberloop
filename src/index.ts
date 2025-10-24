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
// Production Implementations
// ============================================================================

export { MultiBudget } from './core/budget/multi'
export { DeltaScoreEvaluator } from './core/evaluators/delta-score'
export { ProportionalLadder } from './core/ladder/proportional'

// ============================================================================
// Reference Implementations (Optional Meta-Control)
// ============================================================================
// Educational examples for advanced scenarios. Most applications don't need these.
// See src/reference/ for details and src/adapters/github for recommended patterns.

export {
  CheapPassProbe,
  ReasonFailureClassifier,
  RuleBasedStrategySelector,
  SimpleBudgetTracker,
  StagnationTerminationPolicy,
  ThresholdEvaluator,
} from './reference'

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
