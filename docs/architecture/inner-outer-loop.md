# Inner/Outer Loop Architecture

## Summary

We've extended the AICL framework with hierarchical control loop support, enabling both:
1. **Original mode**: Policy-driven exploration (existing)
2. **Adaptive mode**: ProbePolicy + Planner (new)

## New Interfaces

### 1. ProbePolicy (extends Policy)
```typescript
interface ProbePolicy<S, A, F> extends Policy<S, A, F> {
  initialize(state: S): void      // Initialize with planner's initial state
  isStable(state: S): boolean     // Check if state is good enough to stop
}
```

**Purpose**: Fast, deterministic policy for inner loop control
- Makes decisions based on probe signals (gradient information)
- No expensive LLM calls
- High frequency, low cost

### 2. Planner
```typescript
interface Planner<S> {
  plan(input: string): Promise<S>              // Initial planning from user input
  evaluate(state: S, history: S[]): Promise<string>  // Evaluate results
  replan(state: S, history: S[]): Promise<S | null>  // Replan if stuck
}
```

**Purpose**: Strategic planning for outer loop control
- Expensive LLM-based decisions
- Low frequency, high cost
- Called 2-3 times total

### 3. ControlBudget
```typescript
interface ControlBudget {
  innerLoop: BudgetTracker   // Cheap operations (probes, adjustments)
  outerLoop: BudgetTracker   // Expensive operations (LLM calls)
  shouldStop(): boolean
}
```

**Purpose**: Hierarchical budget tracking
- Separates cheap inner loop from expensive outer loop
- Prevents runaway costs in both loops

## Architecture

### Original Mode (Policy-driven)
```
Orchestrator
  ├─ Policy (can be LLM-based)
  ├─ Probes (gradient signals)
  ├─ Evaluator
  ├─ Ladder
  └─ BudgetTracker (single budget)
```

### Adaptive Mode (ProbePolicy + Planner)
```
Orchestrator
  ├─ ProbePolicy (deterministic, inner loop)
  ├─ Planner (strategic, outer loop)
  ├─ Probes (gradient signals)
  ├─ Evaluator
  ├─ Ladder
  └─ ControlBudget (dual budget)
```

## Control Flow (Adaptive Mode)

```
1. Planner.plan(userInput) → initial state
   Cost: 2.0 (outer loop budget)

2. ProbePolicy.initialize(state)
   Cost: 0 (one-time setup)

3. Inner Loop (until stable or budget exhausted):
   a. Run probes → gradient signals
      Cost: 0.05 per probe (inner loop budget)
   
   b. ProbePolicy.decide() → action (deterministic!)
      Cost: 0.1 (inner loop budget)
   
   c. Environment.apply(action) → next state
   
   d. Evaluator.evaluate() → feedback
   
   e. Ladder.update(feedback)
   
   f. Check ProbePolicy.isStable(state)
      - If stable: goto step 4
      - If inner budget exhausted: goto step 5
      - Else: goto step 3a

4. Success path:
   Planner.evaluate(state, history) → final output
   Cost: 2.0 (outer loop budget)
   DONE

5. Rescue path (if outer budget allows):
   Planner.replan(state, history) → new initial state
   Cost: 2.0 (outer loop budget)
   Reset inner budget, goto step 2
```

## Expected Performance

### Baseline (LLM decides everything)
- Tool calls: 3-5
- Duration: 20-30s
- Cost: 6-10 units
- Strategy: LLM controls all decisions

### AICL with Adaptive Mode
- Planner calls: 2-3 (init + evaluate + maybe replan)
- Inner loop iterations: 5-10 (deterministic)
- Duration: 15-25s (competitive!)
- Cost: 6-8 units (2-3 × 2.0 + 5-10 × 0.15)
- Strategy: Framework explores systematically, planner provides semantics

## Implementation Status

✅ **Completed**:
- ProbePolicy interface (extends Policy)
- Planner interface
- ControlBudget interface and implementation
- Documentation

⏳ **Next Steps**:
1. Create GitHub ProbePolicy implementation (deterministic search)
2. Create GitHub Planner implementation (LLM-based)
3. Update GitHub demo to use adaptive mode
4. Run benchmarks and compare

## Files Created

- `src/core/interfaces/policy.ts` - Added ProbePolicy interface
- `src/core/interfaces/planner.ts` - New Planner interface
- `src/core/budget/control-budget.ts` - ControlBudget implementation
- `docs/architecture/inner-outer-loop.md` - This document

## Usage Example (Pseudocode)

```typescript
// Create control budget
const budget = createControlBudget(
  20,  // Inner loop: 20 units for exploration
  6    // Outer loop: 6 units for 3 LLM calls
)

// Create probe policy (deterministic)
const probePolicy = new GitHubProbePolicy()

// Create planner (LLM-based)
const planner = new GitHubPlanner(searchApi)

// Run orchestrator in adaptive mode
const orchestrator = new Orchestrator({
  env,
  evaluator,
  ladder,
  budget: budget.innerLoop,  // Use inner loop budget for main loop
  selector,
  probes,
  policies: [probePolicy],
})

// Outer loop control (manual for now, can be integrated into orchestrator)
const initialState = await planner.plan(userQuery)
probePolicy.initialize(initialState)

const { final, logs } = await orchestrator.run()

if (probePolicy.isStable(final)) {
  const output = await planner.evaluate(final, logs.map(l => l.state))
  console.log(output)
}
```

## Design Principles

1. **Backward Compatible**: Existing orchestrator still works
2. **Opt-in**: Adaptive mode is optional via ProbePolicy + Planner
3. **Composable**: Can mix and match policies and planners
4. **Domain Agnostic**: Core interfaces work for any domain
5. **Control Theory**: Inner/outer loops follow hierarchical control principles

## Next: Implementation

See `docs/examples/two-phase-implementation-plan.md` for detailed implementation steps.
