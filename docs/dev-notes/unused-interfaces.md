# Unused Interfaces in Current Implementation

This document explains why certain interfaces are not currently used in the Inner/Outer Loop architecture, but are kept for future scenarios.

---

## Overview

The current Inner/Outer Loop architecture is intentionally simplified compared to the original AICL design. Several interfaces that were part of the more complex routing system are not currently used, but are preserved for future use cases that require more sophisticated control flow.

---

## Currently Unused Interfaces

### 1. `Policy` (Base Interface)

**Location:** `/src/core/interfaces/policy.ts`

**Status:** Not used directly; only `ProbePolicy` (which extends it) is used.

**Why it's unused:**
- The current architecture uses a single `ProbePolicy` for inner loop decisions
- No need for multiple policy types or dynamic policy selection
- `ProbePolicy` extends `Policy` and adds `initialize()` and `isStable()` methods

**When it would be useful:**

**Scenario: Code Bug Localization**
```typescript
// Multiple specialized policies for different bug types
const policies = [
  new MemoryLeakPolicy(),      // Specialized for memory issues
  new RaceConditionPolicy(),   // Specialized for concurrency bugs
  new LogicErrorPolicy(),      // Specialized for logic bugs
]

// StrategySelector picks the right policy based on bug symptoms
const { policy } = selector.select({
  failure: 'MemoryGrowth',
  context: { stackTrace, metrics }
})
```

**Scenario: Distributed System Triaging**
```typescript
const policies = [
  new NetworkPartitionPolicy(),  // For network issues
  new ServiceDegradationPolicy(), // For performance issues
  new DataCorruptionPolicy(),    // For data issues
]

// Different policies for different failure modes
```

---

### 2. `StrategySelector`

**Location:** `/src/core/interfaces/strategy-selector.ts`

**Status:** Not used; `Planner` handles strategic decisions in the outer loop.

**Why it's unused:**
- Current architecture has clear separation: Planner (outer) + ProbePolicy (inner)
- Only one ProbePolicy implementation, so no routing needed
- Planner already makes strategic decisions about what to explore

**When it would be useful:**

**Scenario: Multi-Domain Agent**
```typescript
// Agent that handles multiple types of tasks
const policies = [
  new CodeSearchPolicy(),      // For code-related queries
  new DataAnalysisPolicy(),    // For data-related queries
  new APIExplorationPolicy(),  // For API discovery
]

const probes = [
  new CodeQualityProbe(),
  new DataValidityProbe(),
  new APIResponseProbe(),
]

// StrategySelector routes based on task type
const { probe, policy } = selector.select({
  failure: taskType,
  ladderLevel,
  budgetRemaining,
  probes,
  policies,
})
```

**Scenario: Adaptive Bug Finder**
```typescript
// Different strategies for different phases of investigation
if (ladderLevel < 0.3) {
  // Early exploration: use broad search
  return { policy: new BroadSearchPolicy(), probe: new HitCountProbe() }
} else if (ladderLevel < 0.7) {
  // Mid exploration: use focused search
  return { policy: new FocusedSearchPolicy(), probe: new RelevanceProbe() }
} else {
  // Late exploration: use deep analysis
  return { policy: new DeepAnalysisPolicy(), probe: new RootCauseProbe() }
}
```

---

### 3. `FailureClassifier`

**Location:** `/src/core/interfaces/failure-classifier.ts`

**Status:** Not used; `ProbePolicy` directly examines state.

**Why it's unused:**
- Current GitHub search has simple failure modes (too many/few hits)
- ProbePolicy can directly check `state.hits` without classification
- No need for intermediate abstraction

**When it would be useful:**

**Scenario: Distributed System Debugging**
```typescript
// Complex failure modes that need expert classification
const classifier = new DistributedSystemClassifier()

const failureType = classifier.classify({
  prev: { latency: 100, errorRate: 0.01 },
  next: { latency: 5000, errorRate: 0.5 },
  action: 'scale_up',
  metrics: {
    cpuUsage: 0.95,
    memoryUsage: 0.80,
    networkErrors: 150,
    diskIO: 'saturated'
  }
})

// Returns: 'NetworkPartition' (not just 'HighLatency')
// This nuanced classification helps route to the right policy
```

**Scenario: Multi-Symptom Bug Diagnosis**
```typescript
// Bug could have multiple symptoms
const failureType = classifier.classify({
  prev: testResults,
  next: testResults,
  action: 'apply_fix',
  probeReason: 'test_still_failing',
  metrics: {
    stackTrace: [...],
    memoryProfile: {...},
    cpuProfile: {...}
  }
})

// Returns: 'RaceCondition' (not just 'TestFailure')
// Enables routing to specialized race condition policy
```

---

### 4. `TerminationPolicy`

**Location:** `/src/core/interfaces/termination.ts`

**Status:** Not used; `ProbePolicy.isStable()` and budget checks handle termination.

**Why it's unused:**
- Current termination logic is simple: stable state or budget exhausted
- `ProbePolicy.isStable()` directly checks if state is acceptable
- Budget tracker handles cost limits

**When it would be useful:**

**Scenario: Multi-Objective Optimization**
```typescript
// Complex stopping criteria beyond simple stability
const terminationPolicy = new MultiObjectiveTermination({
  objectives: [
    { metric: 'accuracy', threshold: 0.95 },
    { metric: 'latency', threshold: 100 },
    { metric: 'cost', threshold: 10 }
  ]
})

const { stop, reason } = terminationPolicy.shouldStop({
  t: 50,
  budgetRemaining: 5,
  noImprovementSteps: 10,
  lastFeedback: 0.85,
  metrics: {
    accuracy: 0.96,  // ✓ Met
    latency: 150,    // ✗ Not met
    cost: 8          // ✓ Met
  }
})

// Returns: { stop: false, reason: 'latency_threshold_not_met' }
```

**Scenario: Adaptive Exploration**
```typescript
// Stop based on diminishing returns
const terminationPolicy = new DiminishingReturnsTermination()

const { stop, reason } = terminationPolicy.shouldStop({
  t: 100,
  budgetRemaining: 10,
  noImprovementSteps: 20,
  lastFeedback: 0.001,  // Very small improvement
  history: [0.5, 0.7, 0.85, 0.90, 0.91, 0.905, 0.906]
})

// Returns: { stop: true, reason: 'diminishing_returns' }
// Even though budget remains, improvements are too small
```

---

## Design Philosophy

### Why Keep Unused Interfaces?

1. **Future-Proofing**
   - More complex scenarios (bug localization, triaging) will need these
   - Better to have well-designed interfaces ready than to redesign later

2. **Documentation**
   - Interfaces serve as documentation of possible extension points
   - Show how the framework can be extended for complex scenarios

3. **Minimal Cost**
   - Keeping interfaces has negligible overhead
   - They're just type definitions, no runtime cost
   - Easy to ignore if not needed

4. **Consistency**
   - Maintains compatibility with original AICL design concepts
   - Easier for users familiar with AICL to understand

### Current Architecture (Simplified)

```
User Input
    ↓
[Outer Loop - Planner]
    ↓ plan()
Initial State
    ↓
[Inner Loop - ProbePolicy]
    ↓ decide() → isStable()?
    ├─ No → apply() → next state → loop
    └─ Yes → exit
    ↓
[Outer Loop - Planner]
    ↓ evaluate()
Final Output
```

**Key simplifications:**
- Single ProbePolicy (no routing needed)
- Direct state examination (no failure classification)
- Simple termination (isStable + budget)
- Planner handles all strategic decisions

### Future Architecture (Complex Scenarios)

```
User Input
    ↓
[Outer Loop - Planner]
    ↓ plan()
Initial State
    ↓
[StrategySelector]
    ↓ select(failure, ladder, budget)
    ├─ Pick Probe
    └─ Pick Policy
    ↓
[Inner Loop - Policy]
    ↓ decide()
    ↓
[Probe] → [FailureClassifier]
    ↓ classify(symptoms)
FailureType
    ↓
[StrategySelector] (re-route if needed)
    ↓
[TerminationPolicy]
    ↓ shouldStop(metrics)
    ├─ No → continue
    └─ Yes → exit
    ↓
[Outer Loop - Planner]
    ↓ evaluate()
Final Output
```

**When you'd need this:**
- Multiple policy types for different problem domains
- Complex failure modes requiring expert classification
- Multi-objective optimization with sophisticated stopping criteria
- Adaptive routing based on exploration progress

---

## Migration Path

If you need to use these interfaces in the future:

### 1. Adding StrategySelector

```typescript
// 1. Implement multiple policies
const policies = [
  new BinarySearchPolicy(),
  new GradientDescentPolicy(),
]

// 2. Implement selector
const selector = new AdaptiveSelector()

// 3. Update orchestrator to use selector
const { probe, policy } = selector.select({
  failure: classifiedFailure,
  ladderLevel: ladder.level(),
  budgetRemaining: budget.remaining(),
  probes,
  policies,
})
```

### 2. Adding FailureClassifier

```typescript
// 1. Implement classifier
const classifier = new DomainSpecificClassifier()

// 2. Classify after probe
const failureType = classifier.classify({
  prev: state,
  next: nextState,
  action,
  probeReason: probeResult.reason,
  metrics: probeResult.data,
})

// 3. Use classification for routing
const { policy } = selector.select({ failure: failureType, ... })
```

### 3. Adding TerminationPolicy

```typescript
// 1. Implement termination policy
const termination = new MultiObjectiveTermination(objectives)

// 2. Check in inner loop
const { stop, reason } = termination.shouldStop({
  t,
  budgetRemaining: budget.remaining(),
  noImprovementSteps,
  lastFeedback,
})

if (stop) {
  console.log(`Stopping: ${reason}`)
  break
}
```

---

## Recommended Use Cases

### When to use current simplified architecture:
- ✅ Single domain (e.g., GitHub search)
- ✅ Simple failure modes (too many/few results)
- ✅ Single exploration strategy
- ✅ Simple termination (stable state + budget)

### When to add StrategySelector:
- Multiple policy types needed
- Dynamic routing based on problem characteristics
- Adaptive strategy selection based on progress

### When to add FailureClassifier:
- Complex failure modes (network, memory, logic, etc.)
- Need expert diagnosis of symptoms
- Multiple failure types requiring different handling

### When to add TerminationPolicy:
- Multi-objective optimization
- Complex stopping criteria
- Diminishing returns detection
- Adaptive exploration budgets

---

## Summary

The unused interfaces are **intentionally preserved** for future scenarios that require more sophisticated control flow. The current Inner/Outer Loop architecture is simplified for clarity and performance, but can be extended when needed for complex domains like:

- **Bug localization** - Multiple policies for different bug types
- **Distributed system triaging** - Complex failure classification
- **Multi-domain agents** - Dynamic strategy selection
- **Multi-objective optimization** - Sophisticated termination criteria

These interfaces represent **extension points** rather than dead code. They document how the framework can grow to handle more complex scenarios while maintaining a clean, simple core for common use cases.
