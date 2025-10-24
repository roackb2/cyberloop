# AICL Component Interactions Guide

**Purpose:** This document explains **how components interact** in the AICL framework, answering questions like:
- Who uses Policy? How?
- How does Orchestrator coordinate everything?
- How do capabilities influence decisions?
- What's the data flow between components?

**For developers:** Understand the wiring and data flow  
**For IDE assistants:** Know how to correctly use each component  
**For researchers:** See the practical implementation of theory

---

## Quick Reference

### Component Roles

| Component | Primary Role | Used By | Uses |
|-----------|--------------|---------|------|
| **Orchestrator** | Coordinates everything | Application code | All components |
| **Planner** | Strategic planning | Orchestrator (outer loop) | None (calls LLM) |
| **ProbePolicy** | Tactical decisions | Orchestrator (inner loop) | Ladder, State |
| **Probe** | Feasibility checks | Orchestrator | State |
| **Environment** | State provider | Orchestrator | None (external system) |
| **Evaluator** | Progress measurement | Orchestrator | State (prev, next) |
| **Ladder** | Exploration intensity | ProbePolicy, Orchestrator | Feedback |
| **Budget** | Resource tracking | Orchestrator | Cost data |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Application                           │
│                             │                                │
│                             ↓                                │
│                      ┌──────────────┐                        │
│                      │ Orchestrator │ ← Coordinates all      │
│                      └──────┬───────┘                        │
│                             │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ↓                     ↓                     ↓
┌───────────────┐    ┌────────────────┐    ┌──────────────┐
│  Outer Loop   │    │  Inner Loop    │    │   Support    │
│               │    │                │    │              │
│ • Planner     │    │ • ProbePolicy  │    │ • Budget     │
│               │    │ • Probe        │    │ • Evaluator  │
│               │    │ • Ladder       │    │ • Ladder     │
│               │    │ • Environment  │    │              │
└───────────────┘    └────────────────┘    └──────────────┘
```

---

## Detailed Interactions

### 1. Application → Orchestrator

**How it works:**

```typescript
// Application creates and configures orchestrator
const orchestrator = new Orchestrator({
  env: new GitHubEnvironment(),
  probePolicy: new DeterministicSearchPolicy(),
  planner: new LLMPlanner(),
  probes: [hitCountProbe, entropyProbe],
  evaluator: new DeltaEvaluator(),
  ladder: new ProportionalLadder(),
  budget: createControlBudget(20, 6),
})

// Application invokes orchestrator
const result = await orchestrator.run("Find Node.js graceful shutdown libraries")
```

**Data flow:**
```
Application
    ↓ (user input: string)
Orchestrator
    ↓ (result: { output, logs, stats })
Application
```

**Key points:**
- Application provides all components (dependency injection)
- Orchestrator handles all coordination
- Application receives final output + execution logs

---

### 2. Orchestrator → Planner (Outer Loop)

**When:** Strategic decisions (2-3 times per run)

**Interaction 1: Initial Planning**

```typescript
// Orchestrator calls planner to create initial strategy
const initialState = await planner.plan(userInput)
// Returns: { query: "...", filters: {...}, constraints: {...} }
```

**Data flow:**
```
Orchestrator
    ↓ (userInput: string)
Planner
    ↓ (calls LLM internally)
    ↓ (initialState: State)
Orchestrator
```

**Interaction 2: Final Evaluation**

```typescript
// After inner loop converges
const output = await planner.evaluate(finalState, history)
// Returns: "Found 15 repositories matching your criteria..."
```

**Data flow:**
```
Orchestrator
    ↓ (finalState: State, history: State[])
Planner
    ↓ (calls LLM internally)
    ↓ (output: string)
Orchestrator
```

**Interaction 3: Replanning (Optional)**

```typescript
// If inner loop exhausted without converging
const newState = await planner.replan(failedState, history)
// Returns: new State or null (give up)
```

**Key points:**
- Planner is **expensive** (2.0 units per call)
- Planner is **infrequent** (2-3 calls total)
- Planner uses **LLM** for strategic reasoning
- Orchestrator controls **when** planner is called

---

### 3. Orchestrator → ProbePolicy (Inner Loop)

**When:** Every inner loop iteration (10-50 times)

**Interaction 1: Initialization**

```typescript
// Orchestrator initializes policy with planner's state
probePolicy.initialize(initialState)
// Policy stores initial context (e.g., keywords, constraints)
```

**Interaction 2: Stability Check**

```typescript
// Orchestrator checks if exploration should stop
const isStable = probePolicy.isStable(currentState)
// Returns: true if state is "good enough"
```

**Data flow:**
```
Orchestrator
    ↓ (currentState: State)
ProbePolicy
    ↓ (checks: hits >= 10 && hits <= 30)
    ↓ (isStable: boolean)
Orchestrator
```

**Interaction 3: Action Decision**

```typescript
// Orchestrator asks policy for next action
const action = await probePolicy.decide(currentState, ladder)
// Returns: { type: 'broaden' | 'narrow' | 'rephrase', payload: {...} }
```

**Data flow:**
```
Orchestrator
    ↓ (currentState: State, ladder: Ladder)
ProbePolicy
    ↓ (reads ladder.level())
    ↓ (reads state.hits, state.filters, state.probes)
    ↓ (decides: narrow/broaden/rephrase)
    ↓ (action: Action)
Orchestrator
```

**Interaction 4: Adaptation (Optional)**

```typescript
// Orchestrator notifies policy of feedback
probePolicy.adapt(feedback, ladder)
// Policy can update internal state based on feedback
```

**Key points:**
- ProbePolicy is **cheap** (0.1 units per call)
- ProbePolicy is **frequent** (10-50 calls per run)
- ProbePolicy is **deterministic** (no LLM calls!)
- ProbePolicy uses **gradient information** (Ladder + Probes + State)

---

### 4. Orchestrator → Probe

**When:** Every inner loop iteration (before policy decision)

**Interaction:**

```typescript
// Orchestrator runs all probes
const probeResults = await Promise.all(
  probes.map(probe => probe.test(currentState))
)
// Returns: [{ pass: true/false, reason?: string, data?: any }, ...]
```

**Data flow:**
```
Orchestrator
    ↓ (currentState: State)
Probe 1 (HitCount)
    ↓ (checks: state.hits >= 1)
    ↓ ({ pass: false, reason: "no-hits" })
Probe 2 (Entropy)
    ↓ (checks: state.entropy < 0.85)
    ↓ ({ pass: true })
Probe 3 (DropGuard)
    ↓ (checks: hits didn't drop to zero)
    ↓ ({ pass: false, reason: "hit-drop-to-zero" })
    ↓ (combined: ProbeResult[])
Orchestrator
    ↓ (stores in state.probes for policy to use)
```

**How ProbePolicy uses probe results:**

```typescript
class DeterministicSearchPolicy {
  decide(state: State, ladder: Ladder): Action {
    // Read probe signals from state
    const recentProbes = state.probes?.slice(-3) || []
    const hasNoHits = recentProbes.some(p => !p.pass && p.reason === "no-hits")
    const hasDropped = recentProbes.some(p => !p.pass && p.reason === "hit-drop-to-zero")
    
    // Use probe signals as gradient information
    if (hasNoHits || hasDropped) {
      return this.broaden(state.filters)  // Probe says: "too narrow!"
    }
    
    // Use other gradients (hits, ladder)
    if (state.hits > 30) return this.narrow(state.filters)
    if (state.hits < 10) return this.broaden(state.filters)
    
    return { type: 'done' }
  }
}
```

**Key points:**
- Probes are **very cheap** (0.05 units per probe)
- Probes are **synchronous** (no async operations)
- Probes provide **directional signals** (not just pass/fail)
- ProbePolicy reads probe results from **state.probes**

---

### 5. Orchestrator → Environment

**When:** Every inner loop iteration (after policy decision)

**Interaction:**

```typescript
// Orchestrator applies action to environment
const nextState = await env.apply(action)
// Returns: new State with updated values
```

**Data flow:**
```
Orchestrator
    ↓ (action: { type: 'narrow', payload: { exact: ['stars:>50'] } })
Environment
    ↓ (applies action: updates filters, calls GitHub API)
    ↓ (nextState: { query: "...", hits: 25, items: [...] })
Orchestrator
```

**Example implementation:**

```typescript
class GitHubEnvironment implements Environment<GhState, GhAction> {
  async apply(action: GhAction): Promise<GhState> {
    // Interpret action
    if (action.type === 'narrow') {
      this.filters.minStars = 50  // Apply narrowing
    }
    
    // Execute search
    const results = await this.api.search(this.query, this.filters)
    
    // Return new state
    return {
      query: this.query,
      filters: this.filters,
      hits: results.total_count,
      items: results.items,
      history: [...this.history, { query: this.query, hits: results.total_count }]
    }
  }
}
```

**Key points:**
- Environment is **domain-specific** (GitHub, filesystem, database, etc.)
- Environment handles **external interactions** (API calls, file I/O)
- Environment returns **new state** (immutable)
- Environment cost varies (API call ≈ 0.1-0.5 units)

---

### 6. Orchestrator → Evaluator

**When:** Every inner loop iteration (after environment applies action)

**Interaction:**

```typescript
// Orchestrator measures progress
const feedback = await evaluator.evaluate(prevState, nextState)
// Returns: number (typically -1 to 1)
```

**Data flow:**
```
Orchestrator
    ↓ (prevState: { hits: 100 }, nextState: { hits: 25 })
Evaluator
    ↓ (computes: improvement = (25 - 100) / 100 = -0.75)
    ↓ (normalizes: feedback = -0.75)
Orchestrator
```

**Example implementation:**

```typescript
class DeltaScoreEvaluator implements Evaluator<GhState, number> {
  evaluate(prev: GhState, next: GhState): number {
    const prevScore = this.score(prev)
    const nextScore = this.score(next)
    return (nextScore - prevScore) / Math.max(prevScore, 1)
  }
  
  private score(state: GhState): number {
    // Closer to target range (10-30) is better
    if (state.hits >= 10 && state.hits <= 30) return 1.0
    if (state.hits < 10) return state.hits / 10  // 0.0 - 1.0
    return 30 / state.hits  // 1.0 - 0.0
  }
}
```

**Key points:**
- Evaluator is **cheap** (0.01 units, just computation)
- Evaluator is **synchronous** (no I/O)
- Evaluator returns **scalar feedback** (progress gradient)
- Feedback is used by **Ladder** and **ProbePolicy**

---

### 7. Orchestrator → Ladder

**When:** Every inner loop iteration (after evaluator)

**Interaction:**

```typescript
// Orchestrator updates exploration intensity
ladder.update(feedback)
// Ladder adjusts internal level based on feedback
```

**Data flow:**
```
Orchestrator
    ↓ (feedback: 0.5)  // Positive = improving
Ladder
    ↓ (currentLevel: 0.3)
    ↓ (updates: level = 0.3 + 0.1 * 0.5 = 0.35)
    ↓ (stores new level)
Orchestrator
```

**How ProbePolicy uses ladder:**

```typescript
class AgentQueryPolicy {
  decide(state: State, ladder: Ladder): Action {
    // Read exploration intensity
    const intensity = ladder.level()  // 0.0 - 1.0
    
    // Use intensity to decide strategy
    if (intensity < 0.3) {
      return { type: 'narrow' }  // Conservative
    } else if (intensity > 0.7) {
      return { type: 'broaden' }  // Aggressive
    } else {
      return { type: 'rephrase' }  // Balanced
    }
  }
}
```

**Example implementation:**

```typescript
class ProportionalLadder implements Ladder<number> {
  private currentLevel = 0.5
  
  level(): number {
    return this.currentLevel
  }
  
  update(feedback: number): void {
    // Positive feedback → increase exploration
    // Negative feedback → decrease exploration
    this.currentLevel = Math.max(0, Math.min(1, 
      this.currentLevel + 0.1 * feedback
    ))
  }
}
```

**Key points:**
- Ladder is **stateful** (maintains exploration level)
- Ladder is **cheap** (0 cost, just state update)
- Ladder provides **intensity gradient** (scalar 0-1)
- ProbePolicy reads ladder via **ladder.level()**

---

### 8. Orchestrator → Budget

**When:** Every operation (probes, decisions, actions, LLM calls)

**Interaction:**

```typescript
// Orchestrator records costs
budget.innerLoop.record(0.05)  // Probe cost
budget.innerLoop.record(0.1)   // Policy decision cost
budget.outerLoop.record(2.0)   // Planner LLM call

// Orchestrator checks limits
if (budget.innerLoop.shouldStop()) {
  // Inner loop exhausted
}
if (budget.outerLoop.shouldStop()) {
  // Outer loop exhausted
}
if (budget.shouldStop()) {
  // Either loop exhausted
}
```

**Data flow:**
```
Orchestrator
    ↓ (records: innerLoop.record(0.15))
Budget
    ↓ (innerRemaining: 20 → 19.85)
    ↓ (shouldStop: false)
Orchestrator
    ↓ (continues)
```

**Example implementation:**

```typescript
class ControlBudget {
  constructor(
    public innerLoop: BudgetTracker,  // 20 units
    public outerLoop: BudgetTracker,  // 6 units
  ) {}
  
  shouldStop(): boolean {
    return this.innerLoop.shouldStop() || this.outerLoop.shouldStop()
  }
}
```

**Key points:**
- Budget is **dual-layer** (inner + outer)
- Budget is **accounting only** (no logic)
- Budget provides **hard limits** (prevents runaway)
- Orchestrator checks budget **frequently**

---

## Complete Execution Flow

### Outer Loop Call #1: Initial Planning

```
Application
    ↓ run("Find Node.js graceful shutdown")
Orchestrator
    ↓ planner.plan(userInput)
Planner
    ↓ [LLM call: extract keywords, create strategy]
    ↓ initialState = { query: "node graceful shutdown", filters: {...} }
Orchestrator
    ↓ probePolicy.initialize(initialState)
ProbePolicy
    ↓ [stores initial keywords]
Orchestrator
    ↓ budget.outerLoop.record(2.0)
Budget
    ↓ [outerRemaining: 6 → 4]
```

### Inner Loop: Iteration 1

```
Orchestrator
    ↓ probes.map(p => p.test(state))
Probes
    ↓ HitCountProbe: { pass: false, reason: "no-hits" }
    ↓ EntropyProbe: { pass: true }
    ↓ DropGuard: { pass: true }
Orchestrator
    ↓ state.probes = [probeResults]
    ↓ probePolicy.isStable(state)
ProbePolicy
    ↓ [checks: hits >= 10 && hits <= 30]
    ↓ isStable = false
Orchestrator
    ↓ probePolicy.decide(state, ladder)
ProbePolicy
    ↓ [reads: ladder.level() = 0.5]
    ↓ [reads: state.probes has "no-hits"]
    ↓ [decides: broaden]
    ↓ action = { type: 'broaden', payload: { synonyms: ['nodejs'] } }
Orchestrator
    ↓ budget.innerLoop.record(0.15)  // probes + decision
    ↓ env.apply(action)
Environment
    ↓ [updates filters, calls GitHub API]
    ↓ nextState = { hits: 106, items: [...] }
Orchestrator
    ↓ evaluator.evaluate(prevState, nextState)
Evaluator
    ↓ [computes: score improved]
    ↓ feedback = 0.6
Orchestrator
    ↓ ladder.update(feedback)
Ladder
    ↓ [level: 0.5 → 0.56]
Orchestrator
    ↓ probePolicy.adapt(feedback, ladder)
ProbePolicy
    ↓ [optional: updates internal state]
```

### Inner Loop: Iterations 2-5

```
[Similar flow, state evolves:]
t=1: hits=106 → action=narrow → hits=25
t=2: hits=25 → isStable=true → STOP
```

### Outer Loop Call #2: Final Evaluation

```
Orchestrator
    ↓ [inner loop converged]
    ↓ planner.evaluate(finalState, history)
Planner
    ↓ [LLM call: summarize results]
    ↓ output = "Found 15 repositories..."
Orchestrator
    ↓ budget.outerLoop.record(2.0)
Budget
    ↓ [outerRemaining: 4 → 2]
Orchestrator
    ↓ return { output, logs, stats }
Application
```

---

## Capabilities System

### What Are Capabilities?

Capabilities are **declarative metadata** that components provide to describe their characteristics. Used by **StrategySelector** (optional, advanced scenarios).

### Policy Capabilities

```typescript
interface Policy<S, A, F> {
  capabilities?(): {
    handles?: string[]              // Failure types it handles
    explorationRange?: [number, number]  // Ladder range where effective
    cost?: { step: number; expected?: number }  // Resource usage
  }
}
```

**Example:**

```typescript
class DeterministicSearchPolicy implements ProbePolicy<GhState, GhAction, number> {
  capabilities() {
    return {
      handles: ['TooBroad', 'TooNarrow', 'NoData'],  // Can handle these failures
      explorationRange: [0, 3] as [number, number],   // Works at any ladder level
      cost: { step: 0.1, expected: 1.5 }              // 0.1 per step, ~15 steps
    }
  }
}
```

### How StrategySelector Uses Capabilities

```typescript
class RuleBasedStrategySelector {
  select(input: {
    failure: FailureType,
    ladderLevel: number,
    budgetRemaining: number,
    policies: Policy[]
  }): { policy: Policy } {
    // Filter policies that can handle this failure
    const capable = policies.filter(p => 
      p.capabilities()?.handles?.includes(input.failure)
    )
    
    // Filter policies effective at current ladder level
    const inRange = capable.filter(p => {
      const [min, max] = p.capabilities()?.explorationRange || [0, Infinity]
      return input.ladderLevel >= min && input.ladderLevel <= max
    })
    
    // Pick cheapest policy that fits budget
    const affordable = inRange.filter(p => {
      const cost = p.capabilities()?.cost?.expected || 0
      return cost <= input.budgetRemaining
    })
    
    return { policy: affordable[0] || policies[0] }
  }
}
```

**Key points:**
- Capabilities are **optional** (not used in basic scenarios)
- Capabilities enable **dynamic routing** (when multiple policies available)
- Capabilities are **declarative** (no runtime overhead)
- Current implementation uses **single ProbePolicy** (no routing needed)

---

## Common Patterns

### Pattern 1: Gradient Synthesis

ProbePolicy combines multiple gradient sources:

```typescript
decide(state: State, ladder: Ladder): Action {
  // Gradient 1: Exploration intensity (Ladder)
  const intensity = ladder.level()
  
  // Gradient 2: Feasibility signals (Probes)
  const probeSignals = state.probes?.slice(-3) || []
  const hasNoHits = probeSignals.some(p => p.reason === "no-hits")
  
  // Gradient 3: Progress (State)
  const hits = state.hits
  
  // Gradient 4: History (Trajectory)
  const recentHits = state.history?.slice(-3).map(h => h.hits) || []
  const isOscillating = recentHits.length > 2 && 
    recentHits[0] === recentHits[2]
  
  // Synthesize decision from all gradients
  if (hasNoHits) return this.broaden()      // Probe says: too narrow
  if (hits > 30) return this.narrow()        // State says: too broad
  if (isOscillating) return this.rephrase()  // History says: stuck
  if (intensity > 0.7) return this.explore() // Ladder says: be aggressive
  
  return { type: 'done' }
}
```

### Pattern 2: Hierarchical Checkpoints

Orchestrator provides strategic checkpoints:

```typescript
async run(userInput: string) {
  // Checkpoint 1: Initial strategy
  const initialState = await planner.plan(userInput)
  
  // Fast reflexive exploration
  const result = await this.exploreInnerLoop(initialState)
  
  // Checkpoint 2: Evaluate results
  if (result.status === 'stable') {
    return await planner.evaluate(result.state)
  }
  
  // Checkpoint 3: Replan if needed
  const newState = await planner.replan(result.state)
  if (newState) {
    return await this.exploreInnerLoop(newState)
  }
  
  return "Exploration exhausted"
}
```

### Pattern 3: State Immutability

Environment returns new state (functional style):

```typescript
async apply(action: Action): Promise<State> {
  // Don't mutate current state
  const newFilters = { ...this.filters }
  
  if (action.type === 'narrow') {
    newFilters.minStars = 50
  }
  
  const results = await this.api.search(this.query, newFilters)
  
  // Return new state object
  return {
    query: this.query,
    filters: newFilters,  // New object
    hits: results.total_count,
    items: results.items,
    history: [...this.history, { query: this.query, hits: results.total_count }]
  }
}
```

---

## Debugging Tips

### Trace Execution Flow

```typescript
// Enable logging in orchestrator
const logs: StepLog[] = []

for (let t = 0; t < maxSteps; t++) {
  const probeResult = await this.runProbes(state)
  const isStable = this.probePolicy.isStable(state)
  
  logs.push({
    t,
    state,
    probeResult,
    isStable,
    ladderLevel: this.ladder.level(),
    budgetRemaining: this.budget.innerLoop.remaining()
  })
  
  if (isStable) break
  
  const action = await this.probePolicy.decide(state, this.ladder)
  // ...
}

return { output, logs }  // Return logs for inspection
```

### Verify Gradient Flow

```typescript
// Check that gradients are being used
class DebugProbePolicy {
  decide(state: State, ladder: Ladder): Action {
    console.log('Gradients:', {
      ladderLevel: ladder.level(),
      probeSignals: state.probes?.map(p => p.reason),
      hits: state.hits,
      historyLength: state.history?.length
    })
    
    // ... decision logic
  }
}
```

### Monitor Budget Usage

```typescript
// Track where costs accumulate
budget.innerLoop.record(0.05)
console.log('After probes:', budget.innerLoop.remaining())

budget.innerLoop.record(0.1)
console.log('After decision:', budget.innerLoop.remaining())
```

---

## Summary

**Key Takeaways:**

1. **Orchestrator coordinates everything** - Single entry point for all interactions
2. **Hierarchical layers** - Outer (strategic, expensive) vs Inner (reflexive, cheap)
3. **Gradient synthesis** - ProbePolicy combines Ladder + Probes + State + History
4. **Immutable state** - Environment returns new state objects
5. **Explicit costs** - Budget tracks every operation
6. **Capabilities are optional** - Used only for advanced routing scenarios

**Data Flow Summary:**

```
Application → Orchestrator
    ↓
Planner (plan) → initialState
    ↓
Inner Loop (10-50 iterations):
    Probes → gradient signals
    ProbePolicy → action (using gradients)
    Environment → nextState
    Evaluator → feedback
    Ladder → updated intensity
    Budget → cost tracking
    ↓
Planner (evaluate) → output
    ↓
Application
```

---

**For more details:**
- **Philosophy:** See [PHILOSOPHY.md](PHILOSOPHY.md)
- **Evolution:** See [EVOLUTION.md](EVOLUTION.md)
- **Current spec:** See [AICL.md](AICL.md)
- **Code:** See `/src/core/orchestrator.ts`

---

**Last Updated:** 2025-10-24  
**Maintained by:** CyberLoop Project  
**License:** Apache-2.0
