# Choosing Your API: SDK vs Orchestrator

CyberLoop offers two ways to add control-loop discipline to your agents. This guide helps you pick the right one.

## Decision Flowchart

```
Do you already have a working agent?
  │
  ├─ YES → Do you want CyberLoop to manage the full
  │        plan → explore → evaluate → replan cycle?
  │          │
  │          ├─ YES → Orchestrator (full control)
  │          └─ NO  → SDK: cyberloop() (recommended)
  │
  └─ NO  → Are you building a research prototype that
           needs explicit inner/outer loop separation?
             │
             ├─ YES → Orchestrator
             └─ NO  → SDK: cyberloop()
```

## At a Glance

| | **SDK — `cyberloop()`** | **Orchestrator** |
|---|---|---|
| **Entry point** | `cyberloop(agent, opts)` | `new Orchestrator({...}).run()` |
| **You provide** | Your agent + optional middleware | Planner, ProbePolicy, Environment, Evaluator, Ladder, Budget, Probes |
| **CyberLoop provides** | Budget enforcement, middleware chain, event hooks | Full plan → explore → evaluate → replan cycle |
| **Outer loop** | **You own it** — you decide how to handle failures, retries, replanning | **CyberLoop owns it** — fixed `plan → explore → evaluate` topology |
| **Inner loop** | CyberLoop instruments it via middleware (budget, policy, kinematics, telemetry) | CyberLoop runs it via ProbePolicy + Ladder + Budget |
| **Minimum code** | ~5 lines | ~50 lines (7+ interfaces) |
| **Best for** | Adding control to existing agents; custom orchestration topologies | Research; full inner/outer loop experiments; reproducing paper benchmarks |

## The Key Insight

**The Orchestrator is a framework** — you build your agent inside its structure.
**The SDK is a library** — it works inside your code.

The Orchestrator prescribes *how* your agent should handle planning, exploration, and failure recovery. This is powerful when you want that structure, but limiting when your domain needs a different topology (multi-agent, human-in-the-loop, custom retry logic, etc.).

The SDK provides **control instruments** (budget tracking, policy composition, drift detection, telemetry) without prescribing how you use them. You compose these instruments into whatever outer-loop strategy makes sense for your domain.

## SDK: Three Tiers

### Tier 1 — Opaque Agent

Wrap any agent that has a `run()` method. CyberLoop adds budget control and event hooks.

```typescript
import { cyberloop } from 'cyberloop'

const controlled = cyberloop(myAgent, { budget: { maxSteps: 20 } })
const result = await controlled.run('your query')
```

### Tier 2 — Steppable Agent

Expose `step()`, `isDone()`, `getInitialState()`, and `toResult()`. CyberLoop runs the step loop and applies middleware around each step.

```typescript
const controlled = cyberloop(mySteppableAgent, {
  budget: { maxSteps: 50 },
  middleware: [telemetryMiddleware(logger), stagnationMiddleware()],
})
```

### Tier 3 — Advanced (Kinematics)

Add EKF/PID drift detection from the Semantic Kinematics system (v2.1) as middleware.

```typescript
import { kinematicsMiddleware } from 'cyberloop/advanced'

const controlled = cyberloop(mySteppableAgent, {
  middleware: [kinematicsMiddleware({ embedder, goalEmbedding, pid, physics })],
})
```

## Orchestrator: Full Inner/Outer Loop

The Orchestrator coordinates the complete control cycle. You implement domain-specific versions of each interface:

```typescript
const orchestrator = new Orchestrator({
  planner,        // LLM-based strategic planning
  probePolicy,    // Deterministic inner-loop exploration
  environment,    // State transitions
  evaluator,      // Feedback scoring
  ladder,         // Exploration intensity
  budget,         // Dual-layer cost tracking
  probes,         // Gradient signal sources
})

const result = await orchestrator.run(userInput)
// Internally: plan → inner loop (5-50 steps) → evaluate → replan if needed
```

## When the SDK Shines

**Multi-agent orchestration** — Each agent gets its own `cyberloop()` wrapper with independent budget and middleware. You control the topology:

```typescript
const planner = cyberloop(plannerAgent, { budget: { maxSteps: 5 } })
const executor = cyberloop(executorAgent, {
  budget: { maxSteps: 50 },
  middleware: [policyMw.middleware, kinematicsMw],
})

const plan = await planner.run(task)
const result = await executor.run(plan.output)

if (!result.output.success) {
  // You decide the failure strategy — not CyberLoop
  const revised = await planner.run(`Revise: ${result.output.error}`)
  // ...
}
```

**Custom failure handling** — Retry, escalate, switch strategy, or abort — your code, your rules.

**Gradual adoption** — Start with Tier 1 (one line), add middleware as you need it.

## When the Orchestrator Shines

- **Reproducing paper benchmarks** — The Wikipedia and GitHub demos use the Orchestrator
- **Strict inner/outer loop separation** — When you need explicit dual-layer budgets and probe-driven exploration
- **Research prototyping** — When you want the framework to enforce the control-loop discipline

## Both Paths Preserve the Philosophy

Both the SDK and Orchestrator implement the five AICL pillars:

1. **Gradient-Guided** — Middleware provides gradient signals (probes, evaluators, kinematics)
2. **Hierarchical** — Inner loop (fast, cheap) vs outer loop (strategic, expensive)
3. **Modular** — Each concern is independent (middleware or interface)
4. **Bounded** — Budget enforcement is always present
5. **Convergent** — Explicit stopping criteria (`isDone()` + budget)

The difference is who owns the outer loop: CyberLoop (Orchestrator) or you (SDK).

---

**Related docs:**
- [README](../../README.md) — Quick start and demos
- [EVOLUTION.md](../whitepaper/EVOLUTION.md) — Why the SDK was introduced
- [ADR-0002](../adr/0002-assistive-sdk-cyberloop-wrapper.md) — Architectural decision record
- [COMPONENT_INTERACTIONS.md](../whitepaper/COMPONENT_INTERACTIONS.md) — Detailed data flow for both paths
