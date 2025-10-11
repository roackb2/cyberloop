# ADR-0001: Inner/Outer Loop Architecture with ProbePolicy and Planner

## Status

**Accepted** - 2025-10-11

## Context

The initial AICL (Adaptive Inner Control Loop) design proposed a complex routing system with multiple policies, strategy selectors, and failure classifiers. After implementing and benchmarking the GitHub search use case, we needed to decide on the core architecture for the framework.

### Initial Design (AICL Paper)

```
User Input
    ↓
[StrategySelector] ← routes based on failure type
    ↓
[Multiple Policies] ← LLM-based or rule-based
    ↓
[FailureClassifier] ← categorizes failures
    ↓
[TerminationPolicy] ← complex stopping criteria
    ↓
Output
```

**Characteristics:**
- Multiple policies with dynamic routing
- Failure classification for policy selection
- Complex termination logic
- All decisions potentially involving LLM calls
- High flexibility but unclear cost boundaries

### Key Problems Identified

1. **Unclear cost boundaries** - LLM calls could happen at multiple layers
2. **Routing complexity** - StrategySelector added overhead for single-domain tasks
3. **Over-engineering for simple cases** - GitHub search didn't need multiple policies
4. **Cost unpredictability** - Hard to control and predict LLM usage

### Design Goals

1. **Clear cost separation** - Expensive LLM calls vs cheap deterministic exploration
2. **Predictable budget control** - Know exactly when and how LLM is used
3. **Systematic exploration** - Deterministic inner loop for reproducibility
4. **Strategic planning** - LLM for high-level decisions only
5. **Extensibility** - Can add complexity when needed for advanced scenarios

## Decision

We adopt an **Inner/Outer Loop architecture** with clear separation of concerns:

### Architecture

```
User Input
    ↓
[Outer Loop - Planner] ← LLM strategic decisions (expensive, infrequent)
    ↓ plan()
Initial State
    ↓
[Inner Loop - ProbePolicy] ← Deterministic exploration (cheap, frequent)
    ↓ decide() → isStable()?
    ├─ No → apply() → next state → loop
    └─ Yes → exit
    ↓
[Outer Loop - Planner]
    ↓ evaluate() or replan()
Final Output
```

### Core Components

1. **Planner (Outer Loop)**
   - `plan(userInput)` - Create initial exploration strategy (LLM call #1)
   - `evaluate(state)` - Assess final results (LLM call #2)
   - `replan(state)` - Adapt strategy if needed (LLM call #3, optional)
   - **Cost:** High (LLM), **Frequency:** Low (2-3 calls per run)

2. **ProbePolicy (Inner Loop)**
   - `initialize(state)` - Set up from planner's initial state
   - `decide(state)` - Deterministic action selection (no LLM)
   - `isStable(state)` - Check if exploration should stop
   - **Cost:** Low (rule-based), **Frequency:** High (5-50 steps)

3. **ControlBudget (Dual-layer)**
   - `outerLoop` - Budget for LLM calls (e.g., 6 units)
   - `innerLoop` - Budget for exploration steps (e.g., 20 units)
   - **Benefit:** Explicit cost control at both layers

### Key Simplifications

1. **Single ProbePolicy** - No StrategySelector needed for single-domain tasks
2. **Direct state examination** - No FailureClassifier, ProbePolicy checks state directly
3. **Integrated termination** - `isStable()` + budget checks replace TerminationPolicy
4. **Planner as strategy selector** - Outer loop handles all strategic decisions

### Preserved Interfaces (For Future Extension)

We keep but don't use:
- `StrategySelector` - For multi-domain agents requiring policy routing
- `FailureClassifier` - For complex failure modes (distributed systems, bug triage)
- `TerminationPolicy` - For multi-objective optimization
- `Policy` (base) - For multiple policy types

See [docs/implementation/unused-interfaces.md](../implementation/unused-interfaces.md) for details.

## Rationale

### Why This Is Better

#### 1. **Aligns with AICL Core Principles**

The new design **more faithfully implements** the AICL vision:

- ✅ **Hierarchical control** - Fast inner loop (cheap) + slow outer loop (expensive)
- ✅ **Gradient-based exploration** - Ladder adjusts exploration intensity
- ✅ **Verifiable convergence** - Probe + isStable() + budget = provable termination
- ✅ **Domain-agnostic interfaces** - Policy/Evaluator/Probe/Planner/Budget

The original single-orchestrator approach mixed strategic and tactical decisions, making cost boundaries unclear.

#### 2. **Explicit Cost Control**

```typescript
// Clear cost model:
Outer Loop (LLM): 2-3 calls × ~2 units = 4-6 units
Inner Loop (API): 5-10 calls × ~0.15 units = 0.75-1.5 units
Total: ~5-8 units (predictable!)

// vs Original (unpredictable):
Policy calls: ??? (could be LLM or not)
Selector calls: ??? (adds overhead)
Total: ??? (hard to predict)
```

#### 3. **Simplicity for Common Cases**

For single-domain tasks (GitHub search, API discovery):
- **No routing overhead** - Direct ProbePolicy execution
- **No classification overhead** - Direct state examination
- **Clear decision flow** - Plan → Explore → Evaluate

#### 4. **Extensibility for Complex Cases**

For multi-domain tasks (bug localization, distributed system triage):
- **Interfaces preserved** - Can add StrategySelector when needed
- **Clear extension points** - Add FailureClassifier for complex diagnosis
- **Documented migration path** - See unused-interfaces.md

### Benchmark Evidence

From our GitHub search benchmark:

| Metric | Baseline | Inner/Outer Loop | Analysis |
|--------|----------|------------------|----------|
| **LLM Calls** | 2 | 2 | ✅ Same cost |
| **API Calls** | 2 | 5 | ⚠️ More exploration |
| **Repos Found** | 3 | 10 | ✅ 3.3x coverage |
| **Duration** | 14.8s | 37.5s | ⚠️ 2.5x slower |
| **Convergence** | Immediate | 5 steps | ✅ Systematic |

**Key insight:** Same LLM cost, better coverage, systematic exploration. Speed can be improved with optimizations (see below).

## Consequences

### Positive

1. **Predictable costs** - LLM usage is explicit and bounded
2. **Reproducible exploration** - Deterministic inner loop behavior
3. **Clear separation** - Strategic (Planner) vs Tactical (ProbePolicy)
4. **Better coverage** - Systematic exploration finds more solutions
5. **Debuggable** - Clear decision trail at both layers
6. **Extensible** - Can add complexity when needed

### Negative

1. **Slower for simple tasks** - Overhead not justified when baseline is good enough
2. **More API calls** - Systematic exploration requires more iterations
3. **Complexity** - More components than simple baseline
4. **Tuning required** - Need to set stability thresholds (e.g., 10-30 hits)

### Neutral

1. **Not for all use cases** - Best for complex search spaces (see use-cases.md)
2. **Learning curve** - Users need to understand inner/outer loop concept
3. **Implementation effort** - Need to implement ProbePolicy and Planner for each domain

## Implementation Notes

### Current Status (v0.1.0)

**Implemented:**
- ✅ Orchestrator with inner/outer loop separation
- ✅ ProbePolicy interface with initialize/decide/isStable
- ✅ Planner interface with plan/evaluate/replan
- ✅ ControlBudget with dual-layer tracking
- ✅ GitHub search demo with DeterministicSearchPolicy
- ✅ Benchmark comparing to baseline

**Not yet implemented:**
- ⚠️ Beam search (parallel candidates)
- ⚠️ Query memoization and deduplication
- ⚠️ Adaptive thresholds (EMA-based)
- ⚠️ Budget linkage (outer → inner coordination)
- ⚠️ Multi-objective evaluation (quality + freshness + license)

### Recommended Optimizations (Priority Order)

Based on feedback from GPT discussion, these optimizations will address the speed/cost concerns:

#### 1. **Beam Search + Query Merging** (High Priority)

**Problem:** Sequential exploration is slow (5 API calls)

**Solution:** Parallel candidates with OR merging
```typescript
// Instead of:
t=0: try "node graceful shutdown" → 106 hits
t=1: try with minStars=50 → 7 hits
t=2: try with minStars=20 → 10 hits

// Do:
t=0: try ["node graceful shutdown", "node AND graceful AND shutdown", "graceful shutdown nodejs"]
     merged as: "(node graceful shutdown) OR (node AND graceful AND shutdown) OR ..."
     → 1 API call, evaluate all 3 candidates, pick best
```

**Impact:** Reduce API calls from 5 to 2-3, speed up 2x

#### 2. **Query Memoization + Result Deduplication** (High Priority)

**Problem:** Oscillation between same queries (106 → 7 → 106)

**Solution:** Cache and detect duplicates
```typescript
// Normalize query
const key = normalize({ keywords, minStars, language })
if (cache.has(key)) return cache.get(key)

// Hash results
const resultHash = md5(items.slice(0, 10))
if (seenHashes.has(resultHash)) {
  console.log('[Cache] Duplicate results detected, stopping')
  return { stable: true }
}
```

**Impact:** Stop oscillation in 2-3 steps instead of 5+

#### 3. **Adaptive Thresholds (EMA)** (Medium Priority)

**Problem:** Hard-coded thresholds (10-30 hits) don't work for all queries

**Solution:** Learn thresholds dynamically
```typescript
// Instead of:
if (hits >= 10 && hits <= 30) return stable

// Do:
const emaHits = 0.3 * hits + 0.7 * prevEmaHits
const variance = Math.abs(hits - emaHits)
if (variance < threshold && hits > minAcceptable) return stable
```

**Impact:** Adapt to different query characteristics automatically

#### 4. **Budget Linkage** (Medium Priority)

**Problem:** Inner/outer loops don't coordinate on budget

**Solution:** Link budgets
```typescript
// When outer loop budget low:
if (outerBudget.remaining() < 1.0) {
  innerLoop.setConservative(true)  // Reduce beam, increase stability threshold
}

// When inner loop plateaus:
if (noImprovementSteps > 5) {
  outerLoop.triggerReplan()  // Ask planner for new strategy
}
```

**Impact:** Better resource allocation, faster convergence

#### 5. **Multi-Objective Evaluation** (Low Priority)

**Problem:** Only measuring quantity (10 repos vs 3), not quality

**Solution:** Composite score
```typescript
score = 
  0.4 * qualityScore(stars, description) +
  0.3 * freshnessScore(lastUpdate) +
  0.2 * licenseScore(license) +
  0.1 * usabilityScore(hasScripts, hasExamples)
```

**Impact:** Demonstrate framework's multi-objective advantage

### Integration with Orchestrator

**Current:** Manual outer loop calls
```typescript
const state = await planner.plan(input)
const result = await orchestrator.exploreInnerLoop(state)
const output = await planner.evaluate(result.state)
```

**Recommended:** Integrated `runAdaptive()`
```typescript
const result = await orchestrator.runAdaptive({
  userInput,
  planner,
  probePolicy,
  controlBudget,
})
// Handles: plan → inner loop → evaluate/replan automatically
// Records: dual-layer timeline, cross-loop events
```

**Benefit:** Cleaner API, better observability, easier testing

## When to Use Which Architecture

| Task Characteristics | Recommended Architecture | Rationale |
|---------------------|-------------------------|-----------|
| **Small search space, strong priors** | Baseline (no loop) | LLM already good, overhead not justified |
| **Large search space, multi-step** | Inner/Outer Loop | Cheap exploration, expensive decisions |
| **Multi-objective** | Inner/Outer + TerminationPolicy | Composable stopping criteria |
| **Multi-domain** | Inner/Outer + StrategySelector | Need policy routing |
| **Complex failures** | Inner/Outer + FailureClassifier | Need diagnostic routing |

See [docs/use-cases.md](../use-cases.md) for detailed scenarios.

## Future Considerations

### Short-term (1-2 weeks)

1. Implement beam search + query merging
2. Add memoization + deduplication
3. Integrate `runAdaptive()` into Orchestrator
4. Add EMA-based adaptive thresholds
5. Implement budget linkage

**Expected outcome:** Speed comparable to baseline, coverage advantage maintained

### Medium-term (1-2 months)

1. Build code bug localization demo (better showcase than GitHub search)
2. Add multi-objective evaluation (quality + freshness + license)
3. Implement TerminationPolicy for multi-objective scenarios
4. Add visualization for dual-layer timeline

**Expected outcome:** Clear demonstration of framework value in complex scenarios

### Long-term (3-6 months)

1. Add StrategySelector for multi-domain agents
2. Add FailureClassifier for distributed system debugging
3. Build distributed system triage demo
4. Research: Automatic policy synthesis from examples

**Expected outcome:** Framework handles complex real-world scenarios (bug triage, system debugging)

## Related Documents

- [Use Cases & Applications](../use-cases.md) - When to use this framework
- [Unused Interfaces](../implementation/unused-interfaces.md) - Why we keep certain interfaces
- [Benchmark Results](../examples/benchmark-results.md) - Performance comparison
- [AICL Whitepaper](../whitepaper/aicl.md) - Original design inspiration

## References

- AICL Paper: Adaptive Inner Control Loop concept
- Control Theory: Hierarchical control systems
- GitHub Search API: Domain-specific implementation
- GPT Discussion: Optimization recommendations (2025-10-11)

---

**Decision made by:** Framework authors  
**Date:** 2025-10-11  
**Supersedes:** Initial AICL routing-based design  
**Superseded by:** None (current)
