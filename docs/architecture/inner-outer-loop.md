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

✅ **Completed (Orchestrator path)**:

- ProbePolicy interface (extends Policy)
- Planner interface
- ControlBudget interface and implementation
- GitHub and Wikipedia adapter implementations
- Benchmarks validated

✅ **Completed (SDK path — v2.2)**:

- `cyberloop()` wrapper with `AgentLike` / `SteppableAgent` protocol
- Middleware system (`Middleware`, `MiddlewareRunner`)
- Built-in middleware: budget, telemetry, stagnation, probe, evaluator, policy
- Advanced middleware: `kinematicsMiddleware` (EKF/PID from v2.1)
- All examples revised to use SDK path

## Files Created

**Orchestrator path (legacy):**

- `src/core/interfaces/policy.ts` - ProbePolicy interface
- `src/core/interfaces/planner.ts` - Planner interface
- `src/core/budget/control-budget.ts` - ControlBudget implementation

**SDK path (v2.2):**

- `src/core/agent-protocol.ts` - AgentLike, SteppableAgent interfaces
- `src/core/wrapper.ts` - `cyberloop()` function
- `src/core/config.ts` - CyberLoopOpts
- `src/core/middleware/types.ts` - Middleware, StepContext, StepResult
- `src/core/middleware/runner.ts` - MiddlewareRunner
- `src/core/middleware/budget.ts` - budgetMiddleware
- `src/core/middleware/telemetry.ts` - telemetryMiddleware
- `src/core/middleware/policy.ts` - policyMiddleware
- `src/advanced/kinematics-middleware.ts` - kinematicsMiddleware

### SDK Mode (v2.2 — cyberloop wrapper)

```
cyberloop(agent, { middleware: [...] })
  ├─ MiddlewareRunner
  │    ├─ beforeStep (in order)
  │    │    ├─ budgetMiddleware (auto)
  │    │    ├─ policyMiddleware
  │    │    └─ kinematicsMiddleware
  │    └─ afterStep (reverse order)
  └─ SteppableAgent.step(state)
       └─ decideAction(state) → env.apply(action)
```

**Key difference from Orchestrator mode:** The user defines the agent and its step logic. CyberLoop wraps it with composable middleware rather than coordinating all components internally.

## Usage Examples

### Orchestrator Mode (Legacy)

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
  budget: budget.innerLoop,
  selector,
  probes,
  policies: [probePolicy],
})

const initialState = await planner.plan(userQuery)
probePolicy.initialize(initialState)

const { final, logs } = await orchestrator.run()

if (probePolicy.isStable(final)) {
  const output = await planner.evaluate(final, logs.map(l => l.state))
  console.log(output)
}
```

### SDK Mode (v2.2)

```typescript
import { cyberloop, telemetryMiddleware } from 'cyberloop'
import { kinematicsMiddleware } from 'cyberloop/advanced'

// Define your agent
const agent: SteppableAgent<MyState, string, MyResult> = {
  run: (input) => /* opaque fallback */,
  getInitialState: (input) => /* setup */,
  step: (state) => /* one iteration */,
  isDone: (state) => /* convergence check */,
  toResult: (state) => /* format output */,
}

// Wrap with middleware
const controlled = cyberloop(agent, {
  budget: { maxSteps: 50 },
  middleware: [
    kinematicsMiddleware({ embedder, goalEmbedding, ... }),
    telemetryMiddleware(logger),
  ],
})

const result = await controlled.run('my query')
```

## Design Principles

1. **Backward Compatible**: Existing Orchestrator still works unchanged
2. **Opt-in**: SDK mode is an alternative path, not a replacement
3. **Composable**: Middleware can be mixed, matched, and reordered
4. **Domain Agnostic**: Core interfaces work for any domain
5. **Control Theory**: Both paths follow hierarchical control principles
6. **Progressive Disclosure**: Start simple (Tier 1), add complexity when needed (Tier 2/3)
