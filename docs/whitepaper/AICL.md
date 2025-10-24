# 🧠 The AICL Whitepaper

## *Artificial Intelligence Control Loop*

**Current Version:** v0.3 (2025-10) - Hierarchical Inner/Outer Loop Architecture  
**Author:** Jay / Fienna Liang · 2025  
**Reference Implementation:** [CyberLoop Framework](https://github.com/roackb2/cyberloop)

**Previous Versions:** [v0.2](versions/v0.2-with-probes.md) | [v0.1](versions/README.md#v01-2025-01)  
**Core Philosophy:** [PHILOSOPHY.md](PHILOSOPHY.md) (Immutable principles)  
**Component Guide:** [COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)  
**Evolution Story:** [EVOLUTION.md](EVOLUTION.md)

---

> **Note:** This document describes the **current implementation** (v0.3).  
> For timeless principles that never change, see [PHILOSOPHY.md](PHILOSOPHY.md).  
> For detailed component interactions, see [COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md).

---

## Abstract

Artificial Intelligence has achieved unprecedented capability,
yet most intelligent systems today remain **uncontrolled**—
highly capable but unstable, unbounded, and unable to sustain learning in dynamic environments.

This whitepaper introduces **AICL (Artificial Intelligence Control Loop)**,
a control-theoretic framework for building *sustainable, self-correcting intelligence*.
AICL models cognition as a **hierarchical feedback system** where agents gain
**internal gradient information** to explore large decision spaces systematically.

Through modular, well-defined components organized into **two control layers**—
a fast reflexive inner loop and a slow strategic outer loop—
AICL enables agents to sense, act, evaluate, and adapt continuously under bounded resources.

We present its first open-source implementation, **CyberLoop**,
a TypeScript-based framework that operationalizes AICL through
interface-first, domain-agnostic design.
AICL aims not to make AI *more powerful*, but to make it *controllably intelligent*.

---

# 1. The Need for Controlled Intelligence

Artificial intelligence today advances at a pace unmatched in human history,
yet the way we build intelligent systems remains fundamentally *uncontrolled*.
Most current architectures optimize for raw capability—bigger models, larger datasets, higher throughput—
but rarely for **stability**, **adaptivity**, or **long-term sustainability**.

As AI systems move from static model inference to *agentic interaction*,
their behavior becomes increasingly unpredictable.
They act across open environments, coordinate with other agents,
and face evolving goals that were never fully encoded in training data.
In such settings, a purely statistical approach to intelligence—
without explicit feedback control—inevitably leads to instability.

Just as early cybernetics once unified biology and engineering
under the principle of **feedback and regulation**,
we now face a similar inflection point in artificial intelligence.
If the last decade was defined by *scaling intelligence*,
the next decade will be defined by *stabilizing it.*

This paper introduces **AICL – the Artificial Intelligence Control Loop**,
a control-theoretic framework for sustainable and self-correcting intelligence.
AICL models an intelligent system not as a black-box predictor,
but as a **hierarchical feedback system** organized into two control layers:

### Inner Loop: Reflexive Control (Fast, Cheap, Frequent)

**Purpose:** Tactical exploration using gradient signals

- **ProbePolicy** — Fast, deterministic action selection based on gradients
- **Probe** — Cheap feasibility checks providing directional signals
- **Evaluator** — Measures progress and stability
- **Ladder** — Internal gradient regulating exploration intensity

### Outer Loop: Strategic Control (Slow, Expensive, Infrequent)

**Purpose:** High-level planning and evaluation

- **Planner** — LLM-based strategic planning and result evaluation
- **Environment** — State provider and action executor
- **ControlBudget** — Dual-layer resource tracking (inner + outer)

### Optional Meta-Control (Advanced Scenarios)

- **StrategySelector** — Routes between multiple policies (multi-domain)
- **FailureClassifier** — Diagnoses complex failure modes
- **TerminationPolicy** — Multi-objective stopping criteria

Together, these components enable agents to **explore large decision spaces systematically**,
**converge reliably**, and **operate sustainably over extended time horizons**.

While existing paradigms like Reinforcement Learning or RLHF
optimize for reward acquisition,
AICL focuses on *stability acquisition*—
ensuring that intelligent behavior remains safe, interpretable,
and capable of sustained improvement through time.

We believe that the **future of intelligence is not in creating smarter models,
but in creating controllable systems**—
systems that can continue learning without collapsing,
exploring without drifting,
and adapting without forgetting their goals.

**AICL** represents a step toward this future:
a unifying language for controlled intelligence,
and a practical foundation for frameworks like **CyberLoop**,
which implement this architecture in real-world applications.

---

# 2. The AICL Architecture

While traditional AI systems rely on external optimization objectives,
AICL treats intelligence as an **intrinsically regulated control system**.
It models cognition as a **hierarchical control loop** with two layers:
**fast reflexive control** (cheap, frequent) and **slow strategic control** (expensive, infrequent).

The goal is not merely to maximize a fixed reward,
but to sustain a stable, adaptive trajectory through uncertainty using
**multi-dimensional gradient information**.

## 2.1 Hierarchical Architecture

AICL implements a **two-layer control system** inspired by hierarchical control theory:

### Inner Loop: Reflexive Control

Fast, deterministic layer for tactical exploration (10-50 iterations per outer call)

| Component | Role | Cost | Frequency |
|-----------|------|------|----------|
| **ProbePolicy** | Tactical action generator | 0.1 units/step | High (10-50 steps) |
| **Probe** | Gradient signal provider | 0.05 units/test | High (per step) |
| **Evaluator** | Feedback computer | 0.01 units | High (per step) |
| **Ladder** | Exploration modulator | 0 (stateful) | High (per step) |

**Design Philosophy:**
- **Deterministic** - Reproducible, debuggable
- **Gradient-aware** - Uses Ladder + Probes + History
- **Resource-efficient** - Can run 10-50+ iterations sustainably
- **Convergence-driven** - Knows when "good enough" is reached

### Outer Loop: Strategic Control

Slow, LLM-based layer for strategic planning (2-3 calls per run)

| Component | Role | Cost | Frequency |
|-----------|------|------|----------|
| **Planner** | Strategic planner | 2.0 units/call | Low (2-3 calls) |
| **Environment** | State provider | Varies | Per action |
| **ControlBudget** | Dual-layer tracker | 0 (accounting) | Continuous |

**Design Philosophy:**
- **LLM-powered** - Leverage reasoning for complex decisions
- **Infrequent calls** - 2-3 strategic checkpoints per run
- **Bounded by design** - Explicit limits prevent runaway costs
- **Checkpoint-based** - Prevents drift through periodic evaluation

### Optional Meta-Control (Advanced)

For multi-domain coordination (when single policy insufficient)

| Component | Role | When Used |
|-----------|------|----------|
| **StrategySelector** | Policy router | Multiple problem types |
| **FailureClassifier** | Diagnostic expert | Complex failure modes |
| **TerminationPolicy** | Stop criteria | Multi-objective optimization |

**Design Philosophy:**
- **Opt-in complexity** - Only use when simpler approaches insufficient
- **Extensibility point** - Framework can grow without breaking core

---

## 2.2 Hierarchical Control Flow

AICL follows a **hierarchical execution pattern** where strategic planning happens infrequently,
while tactical exploration happens frequently:

```
Outer Loop (Strategic, 2-3 calls total):
  ├─ Planner.plan(userInput) → initialState
  ├─ Inner Loop (Reflexive, 10-50 iterations):
  │   ├─ Probes.test(state) → gradient signals
  │   ├─ ProbePolicy.decide(state, ladder) → action
  │   ├─ Environment.apply(action) → nextState
  │   ├─ Evaluator.evaluate(prevState, nextState) → feedback
  │   ├─ Ladder.update(feedback) → adjusted intensity
  │   └─ Check: isStable() or budget exhausted?
  └─ Planner.evaluate(finalState) → output
```

### Outer Loop: Strategic Layer

**Step 1: Initial Planning** (LLM call #1)

```
Planner.plan(userInput) → initialState
Cost: 2.0 units
```

The Planner uses LLM reasoning to create an initial exploration strategy from user input.

**Step 2: Inner Loop Exploration**

See below for detailed inner loop flow.

**Step 3: Evaluation or Replanning**

```
if innerLoop.status === 'stable':
  output = Planner.evaluate(finalState, history)
  Cost: 2.0 units (LLM call #2)
  return output

else if outerBudget.remaining() > 0:
  newState = Planner.replan(failedState, history)
  Cost: 2.0 units (LLM call #3, optional)
  if newState: goto Step 2
```

### Inner Loop: Reflexive Layer

At each iteration *t* (until stable or budget exhausted):

**1. Run Probes** → gradient signals

```
probeResults = Probes.map(p => p.test(state_t))
Cost: 0.05 units per probe
```

Probes provide cheap, directional signals: "too-narrow", "stuck-at-zero", "drop-detected"

**2. Check Stability**

```
if ProbePolicy.isStable(state_t):
  return { status: 'stable', state: state_t }
```

ProbePolicy determines if current state is "good enough" to stop.

**3. Decide Action** (deterministic, no LLM!)

```
action_t = ProbePolicy.decide(state_t, ladder)
Cost: 0.1 units
```

ProbePolicy uses gradient information (Ladder + Probes + History) to decide next action.

**4. Apply & Evaluate**

```
state_{t+1} = Environment.apply(action_t)
feedback_t = Evaluator.evaluate(state_t, state_{t+1})
```

Environment executes action, Evaluator measures progress.

**5. Update Gradient**

```
Ladder.update(feedback_t)
ProbePolicy.adapt(feedback_t, ladder)  // optional
```

Ladder adjusts exploration intensity based on feedback.

**6. Check Budget**

```
if ControlBudget.innerLoop.shouldStop():
  return { status: 'budget-exhausted', state: state_t }
```

**7. Continue** → goto step 1

### Cost Model Comparison

**AICL (Hierarchical):**
- Outer loop: 2-3 calls × 2.0 = **4-6 units**
- Inner loop: 10-20 steps × 0.15 = **1.5-3 units**
- **Total: 5.5-9 units** (predictable!)

**Flat architecture (v0.2):**
- LLM calls at every decision point
- Total: **10-30 units** (varies wildly)

**Key advantage:** Same or better results with predictable, bounded costs.

---

## 2.3 The Relaxation Ladder

The **Ladder (L)** acts as an *internal gradient*, controlling exploration intensity:

| Stage | Ladder Signal | Agent Behavior |
|--------|----------------|----------------|
| \( L_0 \) | Tight constraint | Conservative exploration |
| \( L_1 \) | Moderate | Controlled deviation |
| \( L_2 \) | Full relaxation | Radical exploration |

\[\ L_{t+1} = L_t + \lambda (f_t - \delta)\]

If feedback improves but remains stable, exploration increases.
If instability rises, constraints tighten—creating a **self-tuning exploration policy**.

---

# 3. Implementation: CyberLoop

**CyberLoop** is the reference implementation of AICL, demonstrating how
philosophical principles translate into working code.

> **Note:** For detailed component interactions and usage patterns, see [COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md).

## 3.1 Core Interfaces

### Hierarchical Control Interfaces

```ts
// Outer Loop: Strategic Control
interface Planner<State> {
  plan(userInput: string): Promise<State>           // Initial strategy (LLM call #1)
  evaluate(state: State, history: State[]): Promise<string>  // Final assessment (LLM call #2)
  replan?(state: State, history: State[]): Promise<State | null>  // Adapt if needed (LLM call #3)
}

// Inner Loop: Reflexive Control
interface ProbePolicy<State, Action, Feedback> extends Policy<State, Action, Feedback> {
  initialize(state: State): void                    // Initialize with planner's state
  isStable(state: State): boolean                   // Check if "good enough"
  decide(state: State, ladder: Ladder<Feedback>): Action  // Deterministic decision
  adapt?(feedback: Feedback, ladder: Ladder<Feedback>): void  // Optional adaptation
}
```

### Gradient Information Providers

```ts
// Multi-dimensional gradient signals
interface Probe<State> {
  test(state: State): { pass: boolean; reason?: string; data?: any }
}

interface Ladder<Feedback> {
  level(): number                    // Current exploration intensity (0-1)
  update(feedback: Feedback): void   // Adjust based on progress
}

interface Evaluator<State, Feedback> {
  evaluate(prev: State, next: State): Feedback  // Measure progress
}
```

### Resource Management

```ts
// Dual-layer budget tracking
interface ControlBudget {
  innerLoop: BudgetTracker   // Cheap operations (probes, decisions)
  outerLoop: BudgetTracker   // Expensive operations (LLM calls)
  shouldStop(): boolean      // True if either exhausted
}

interface BudgetTracker {
  record(cost: number): void
  remaining(): number
  shouldStop(): boolean
  reset?(value?: number): void
}
```

### State Space

```ts
interface Environment<State, Action> {
  observe(): State                      // Get current state
  apply(action: Action): Promise<State> // Execute action, return new state
}
```

## 3.2 Orchestrator

The Orchestrator coordinates all components in the hierarchical control loop:

```ts
class Orchestrator<State, Action, Feedback> {
  constructor(opts: {
    env: Environment<State, Action>
    probePolicy: ProbePolicy<State, Action, Feedback>
    planner: Planner<State>
    probes: Probe<State>[]
    evaluator: Evaluator<State, Feedback>
    ladder: Ladder<Feedback>
    budget: ControlBudget
  })

  async run(userInput: string): Promise<{
    output: string
    explorationAttempts: number
    innerLoopSteps: number
    outerLoopCalls: number
    logs: StepLog[]
  }>
}
```

**Key characteristics:**
- Manages outer loop (Planner calls)
- Executes inner loop (ProbePolicy iterations)
- Tracks costs at both layers
- Provides detailed execution logs

---

# 4. Experimental Domain: GitHub Repository Search

The GitHub search experiment validates AICL's hierarchical control principles in a real-world scenario.

## 4.1 Problem Statement

**Task:** Find relevant GitHub repositories matching a natural language query

**Challenges:**
- Balance between too broad (1000s of hits) and too narrow (0 hits)
- Limited API calls due to rate limits
- Need systematic exploration, not random search
- Bounded LLM budget

**Example Query:** *"Find Node.js libraries for graceful server shutdown"*

## 4.2 Implementation

### Outer Loop: Strategic Planner

```ts
class GitHubPlanner implements Planner<GhState> {
  async plan(userInput: string): Promise<GhState> {
    // LLM extracts keywords, filters, constraints
    const response = await this.llm.complete({
      prompt: `Extract search strategy for: "${userInput}"`,
      schema: SearchStrategySchema
    })
    
    return {
      query: response.query,
      filters: {
        keywords: response.keywords,
        minStars: 0,
        language: response.language
      }
    }
  }
  
  async evaluate(state: GhState, history: GhState[]): Promise<string> {
    // LLM summarizes results
    return await this.llm.complete({
      prompt: `Summarize these ${state.hits} repositories...`,
      context: { items: state.items, history }
    })
  }
}
```

### Inner Loop: Deterministic Policy

```ts
class DeterministicSearchPolicy implements ProbePolicy<GhState, GhAction, number> {
  isStable(state: GhState): boolean {
    // Sweet spot: 10-30 results
    return state.hits >= 10 && state.hits <= 30
  }
  
  decide(state: GhState, ladder: Ladder<number>): GhAction {
    const { hits, filters } = state
    
    // Use probe signals as gradient information
    const recentProbes = state.probes?.slice(-3) || []
    const hasNoHits = recentProbes.some(p => !p.pass && p.reason === "no-hits")
    
    if (hasNoHits || hits === 0) {
      return this.broaden(filters)  // Probe says: too narrow!
    }
    
    if (hits > 30) {
      return this.narrow(filters)   // Too many results
    }
    
    if (hits < 10) {
      return this.broaden(filters)  // Too few results
    }
    
    return { type: 'done' }  // Stable!
  }
  
  private narrow(filters: SearchFilters): GhAction {
    // Increase minStars to filter for quality
    return {
      type: 'narrow',
      payload: { exact: [`stars:>${(filters.minStars || 0) + 50}`] }
    }
  }
  
  private broaden(filters: SearchFilters): GhAction {
    // Remove constraints or add synonyms
    if (filters.minStars > 0) {
      return { type: 'broaden', payload: { synonyms: ['stars:>0'] } }
    }
    return { type: 'broaden', payload: {} }
  }
}
```

### Probes: Gradient Signals

```ts
// Probe 1: Check if we have any hits
const hasHitsProbe: Probe<GhState> = {
  test: (state) => ({
    pass: state.hits > 0,
    reason: state.hits === 0 ? 'no-hits' : undefined
  })
}

// Probe 2: Check if hits dropped significantly
const dropGuardProbe: Probe<GhState> = {
  test: (state) => {
    const previous = state.history?.slice(-1)[0]?.hits || 0
    if (previous > 0 && state.hits === 0) {
      return { pass: false, reason: 'hit-drop-to-zero' }
    }
    return { pass: true }
  }
}

// Probe 3: Check entropy (result diversity)
const entropyProbe: Probe<GhState> = {
  test: (state) => ({
    pass: state.entropy >= 0.15 && state.entropy <= 0.85,
    reason: state.entropy > 0.85 ? 'too-broad' : 
            state.entropy < 0.15 ? 'too-narrow' : undefined
  })
}
```

## 4.3 Results

Comparison with baseline (LLM-only approach):

| Metric | Baseline (LLM-only) | AICL (Hierarchical) | Improvement |
|--------|---------------------|---------------------|-------------|
| **Relevant Repos Found** | 3 | 10 | **3.3x** ✅ |
| **LLM Calls** | 2 | 2 | Same ✅ |
| **API Calls** | 2 | 5 | 2.5x (acceptable) |
| **Total Cost** | 4.2 units | 5.8 units | 1.4x (acceptable) |
| **Success Rate** | 60% | 85% | **+25%** ✅ |
| **Duration** | 15s | 25s | 1.7x (thorough) |

**Key Insights:**

1. **Same LLM cost, better coverage** - Systematic exploration finds more results
2. **Predictable resource usage** - 2 LLM calls + bounded API calls
3. **Reproducible** - Deterministic inner loop with same seed → same trajectory
4. **Interpretable** - Probe signals explain why decisions were made

## 4.4 Execution Trace Example

```
[Outer Loop] Planner.plan("Node.js graceful shutdown")
  → initialState: { query: "node graceful shutdown", filters: {...} }
  Cost: 2.0 units

[Inner Loop t=0]
  Probes: hasHits=false (no-hits), dropGuard=true, entropy=N/A
  State: hits=0
  Decision: broaden (add synonyms: ["nodejs", "graceful", "shutdown"])
  Cost: 0.15 units

[Inner Loop t=1]
  Probes: hasHits=true, dropGuard=true, entropy=0.72
  State: hits=106
  Decision: narrow (add minStars:>50)
  Cost: 0.15 units

[Inner Loop t=2]
  Probes: hasHits=true, dropGuard=true, entropy=0.45
  State: hits=25
  isStable: true (10 <= 25 <= 30) ✓
  
[Outer Loop] Planner.evaluate(finalState)
  → "Found 15 high-quality Node.js libraries for graceful shutdown..."
  Cost: 2.0 units

Total: 2 outer calls + 2 inner iterations = 4.3 units
```

---

# 5. Discussion & Future Vision

## 5.1 Controlled Intelligence

> “Can AI remain intelligent while acting continuously?”

AICL answers this through bounded, feedback-driven autonomy.

## 5.2 CyberLoop Ecosystem Vision

### Current Status (v1.0)

| Component | Status | Description |
|-----------|--------|-------------|
| **Core Framework** | ✅ Stable | Orchestrator with hierarchical inner/outer loops |
| **GitHub Adapter** | ✅ Complete | Repository search with ProbePolicy + Planner |
| **Budget System** | ✅ Complete | ControlBudget with dual-layer tracking |
| **Probe Library** | ✅ Basic | HitCount, Entropy, DropGuard probes |
| **Documentation** | ✅ Complete | Philosophy, Component Interactions, Evolution |

### Roadmap

**v1.1 - Enhanced Exploration** (Next 1-2 months)
- Beam search for parallel candidate exploration
- Query memoization and deduplication
- Adaptive thresholds using EMA
- Budget linkage between inner/outer loops

**v1.2 - Multi-Domain Support** (3-6 months)
- StrategySelector implementation for policy routing
- FailureClassifier for complex failure modes
- Code bug localization demo
- Multi-objective evaluation

**v1.3 - Production Features** (6-12 months)
- Trace visualization dashboard
- Replay and debugging tools
- Performance benchmarks across domains
- Monitoring and observability

**v2.0 - Advanced Control** (12+ months)
- Multi-objective optimization with trade-offs
- Distributed system debugging
- Automatic policy synthesis from examples
- Cross-domain transfer learning

### Ecosystem Layers

| Layer | Example | Purpose |
|-------|----------|---------|
| **Core Kernel** | `cyberloop/core` | Base hierarchical control loop |
| **Domain Adapters** | `github`, `filesystem`, `api-discovery` | Plug-in environments |
| **Control Plugins** | Ladder variants, probe strategies | Extend feedback behaviors |
| **Monitoring Tools** | Dashboard, metrics, trace viewer | Visualize control dynamics |

---

# Epilogue

> “Uncontrolled intelligence grows powerful but fragile.
> Controlled intelligence grows stable — and endures.”

Through AICL and CyberLoop,
we take the first step from optimization to regulation,
from reaction to reflection,
from artificial intelligence to **controlled intelligence**.

---

---

## Related Documentation

- **[PHILOSOPHY.md](PHILOSOPHY.md)** - Immutable core principles
- **[COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)** - How components work together
- **[EVOLUTION.md](EVOLUTION.md)** - Why the architecture evolved
- **[versions/](versions/)** - Previous whitepaper versions
- **[ADR-0001](../adr/0001-inner-outer-loop-architecture.md)** - Detailed design decision

---

*End of AICL Whitepaper v0.3 (Hierarchical Inner/Outer Loop Architecture)*  
© 2025 Fienna Liang. Licensed under Apache-2.0.

**Version History:**
- v0.3 (2025-10): Hierarchical architecture with ProbePolicy + Planner
- v0.2 (2025-03): Added Probe, BudgetTracker, StrategySelector
- v0.1 (2025-01): Original concept
