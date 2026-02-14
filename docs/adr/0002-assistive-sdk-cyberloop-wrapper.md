# ADR-0002: Assistive SDK — cyberloop() Wrapper and Middleware System

## Status

**Accepted** - 2026-02-14

## Context

After implementing the Inner/Outer Loop architecture (ADR-0001), we validated the control loop concepts across two domains: GitHub search (deterministic state machine) and Wikipedia navigation (semantic kinematics with EKF/PID). Both demonstrated the value of hierarchical control.

However, adoption feedback revealed friction:

### Problem 1: High Entry Barrier

The Orchestrator-based API required users to learn and implement 7+ interfaces (`Environment`, `ProbePolicy`, `Planner`, `Evaluator`, `Ladder`, `BudgetTracker`, `Probe`) before getting any value. For users who already had a working agent and simply wanted to add stability controls, this was prohibitive.

### Problem 2: Monolithic Orchestrator

Adding a new cross-cutting concern (e.g., stagnation detection, telemetry) required modifying the Orchestrator or subclassing it. There was no composable way to layer concerns.

### Problem 3: Policy Stack Wiring

Users had to manually construct `ChainPolicy` with guards, reflexes, and a base policy, then wire initialization and ladder feedback themselves. This was error-prone boilerplate.

### Design Goals

1. **Wrap, don't rewrite** — Users bring their existing agent; CyberLoop adds control
2. **Progressive disclosure** — Start with one line, add complexity when needed
3. **Composable concerns** — Each control concern is an independent plug-in
4. **Backward compatible** — Orchestrator API preserved unchanged
5. **Philosophy preserved** — All five AICL pillars maintained

## Decision

We introduce a three-tier **Assistive SDK** alongside the existing Orchestrator:

### Tier 1: Opaque Agent

```typescript
import { cyberloop } from 'cyberloop'

const controlled = cyberloop(myAgent, { budget: { maxSteps: 20 } })
const result = await controlled.run('query')
```

- User provides any object with `run(input): Promise<AgentResult>`
- CyberLoop adds budget control and event hooks
- No step-level visibility

### Tier 2: Steppable Agent

```typescript
const controlled = cyberloop(mySteppableAgent, {
  budget: { maxSteps: 50 },
  middleware: [telemetryMiddleware(logger), stagnationMiddleware()],
})
```

- User provides `SteppableAgent` with `step()`, `isDone()`, `getInitialState()`, `toResult()`
- CyberLoop runs the step loop with composable middleware
- Each middleware has `beforeStep` / `afterStep` / `setup` / `teardown` hooks

### Tier 3: Advanced (Kinematics)

```typescript
import { kinematicsMiddleware } from 'cyberloop/advanced'

const controlled = cyberloop(mySteppableAgent, {
  middleware: [kinematicsMiddleware({ embedder, goalEmbedding, pid, physics })],
})
```

- Adds EKF/PID drift detection from v2.1 as a middleware
- Same `PhysicsEngine` and `PIDController`, thin adapter

### Key Components

1. **`AgentLike`** — Opaque agent interface (`run()` only)
2. **`SteppableAgent`** — Extended interface with `step()`, `isDone()`, `getInitialState()`, `toResult()`
3. **`cyberloop(agent, opts)`** — Wrapper function that detects agent type and runs accordingly
4. **`Middleware`** — Interface with optional `beforeStep`, `afterStep`, `setup`, `teardown`
5. **`MiddlewareRunner`** — Executes middleware chain (beforeStep in order, afterStep in reverse)
6. **`budgetMiddleware`** — Auto-registered; counts steps, halts on budget exhaustion
7. **`policyMiddleware`** — Wraps `ChainPolicy` declaratively; returns `decideAction()` for use in `step()`
8. **`kinematicsMiddleware`** — Wraps `PhysicsEngine` + `PIDController`; observes and annotates

### Architecture

```
cyberloop(agent, { middleware: [...] })
  ├─ MiddlewareRunner
  │    ├─ beforeStep (in registration order)
  │    │    ├─ budgetMiddleware (auto)
  │    │    ├─ policyMiddleware
  │    │    └─ kinematicsMiddleware
  │    └─ afterStep (reverse order)
  └─ SteppableAgent.step(state) (user-defined)
       └─ decideAction(state) → env.apply(action)
```

## Rationale

### Why Middleware Over Orchestrator Extension

The Orchestrator coordinates a fixed set of components in a fixed order. Middleware is inherently composable — each concern is independent, can be added/removed/reordered without touching framework internals. This mirrors successful patterns in Express.js, Koa, and Redux.

### Why Two-Part policyMiddleware

The `SteppableAgent.step(state)` signature only receives `state`, not the full `StepContext` with metadata. Therefore, middleware cannot pre-compute the policy action and pass it through. Instead, `policyMiddleware()` returns both:
- `middleware` — for lifecycle hooks (setup reset, afterStep metadata/feedback)
- `decideAction(state)` — for the agent to call inside `step()`

This preserves the clean `step(state)` contract while enabling declarative policy configuration.

### Why Not Replace the Orchestrator

The Orchestrator handles the full inner/outer loop (Planner integration, dual-layer budgets, probe-driven exploration). The SDK handles the inner loop only. For users who need the full two-level architecture with LLM-based planning, the Orchestrator remains the right choice. Both paths coexist.

### Philosophy Alignment

| Pillar | How the SDK Preserves It |
|--------|--------------------------|
| **Gradient-Guided** | Middleware provides composable gradient sources (probes, evaluators, kinematics) |
| **Hierarchical** | Three tiers mirror inner/outer loop separation |
| **Modular** | Each middleware is an independent, single-responsibility plug-in |
| **Bounded** | `budgetMiddleware` auto-registered; hard limits always enforced |
| **Convergent** | `isDone()` + budget halting provide explicit stopping criteria |

## Consequences

### Positive

1. **Lower adoption barrier** — One-line integration for existing agents
2. **Composable control** — Add/remove concerns without framework changes
3. **Declarative policy wiring** — `policyMiddleware` replaces manual `ChainPolicy` construction
4. **Backward compatible** — Zero changes to Orchestrator, all existing code works
5. **Testable** — Each middleware is independently unit-testable (337 tests, 28 files)
6. **Progressive** — Users start simple and add complexity as needed

### Negative

1. **Two API paths** — Users must choose between Orchestrator and `cyberloop()` (mitigated by clear guidance in docs)
2. **No outer loop in SDK** — Planner integration not yet available via middleware (future work)
3. **Learning curve** — Middleware ordering matters (beforeStep in order, afterStep in reverse)

### Neutral

1. **Orchestrator not deprecated** — Both paths maintained; Orchestrator for full inner/outer loop, SDK for inner loop only
2. **Migration optional** — Existing Orchestrator users have no pressure to migrate

## Implementation Notes

### Current Status

**Implemented (Phases 0-7):**
- ✅ `AgentLike` and `SteppableAgent` interfaces
- ✅ `cyberloop()` wrapper with opaque and steppable detection
- ✅ `Middleware` interface and `MiddlewareRunner`
- ✅ Built-in middleware: budget, telemetry, stagnation, probe, evaluator, policy
- ✅ Advanced middleware: `kinematicsMiddleware`
- ✅ 337 tests across 28 files, all passing
- ✅ ESLint clean
- ✅ 3 new standalone examples (quickstart, middleware-demo, openai-agents-demo)
- ✅ 6 revised examples (GitHub × 2, Wikipedia × 1, each with legacy + SDK version)

### Key Files

- `src/core/agent-protocol.ts` — AgentLike, SteppableAgent
- `src/core/wrapper.ts` — `cyberloop()`
- `src/core/config.ts` — CyberLoopOpts
- `src/core/middleware/types.ts` — Middleware, StepContext, StepResult
- `src/core/middleware/runner.ts` — MiddlewareRunner
- `src/core/middleware/budget.ts` — budgetMiddleware
- `src/core/middleware/policy.ts` — policyMiddleware
- `src/core/middleware/telemetry.ts` — telemetryMiddleware
- `src/advanced/kinematics-middleware.ts` — kinematicsMiddleware

## Alternatives Considered

### Alternative 1: Extend Orchestrator with Plugin System

**Description:** Add a plugin/hook system to the existing Orchestrator rather than creating a new wrapper.

**Pros:**
- Single API path
- Reuses existing coordination logic

**Cons:**
- Orchestrator already complex; plugins add more complexity
- Still requires users to learn Orchestrator interfaces first
- Doesn't address the "wrap my existing agent" use case

**Why rejected:** Doesn't solve the core adoption barrier. Users with existing agents shouldn't need to restructure their code to fit the Orchestrator's component model.

### Alternative 2: Middleware-Only (No Agent Protocol)

**Description:** Provide middleware as standalone functions that users compose manually, without the `cyberloop()` wrapper or agent protocol.

**Pros:**
- Maximum flexibility
- No new abstractions

**Cons:**
- No standard step loop — users must write their own
- No automatic budget enforcement
- No progressive disclosure — all complexity exposed immediately

**Why rejected:** Defeats the purpose of "assistive." The `cyberloop()` wrapper provides the step loop and automatic budget enforcement that make the SDK useful out of the box.

### Alternative 3: Decorator Pattern

**Description:** Use class decorators or higher-order functions to add control concerns to agents.

**Pros:**
- Familiar pattern for OOP developers
- Type-safe composition

**Cons:**
- Decorators compose poorly (ordering is implicit)
- Hard to inspect or debug the decoration chain
- Less flexible than middleware (no beforeStep/afterStep distinction)

**Why rejected:** Middleware is more explicit about ordering and lifecycle, and is a well-understood pattern from web frameworks.

## Related Decisions

- [ADR-0001: Inner/Outer Loop Architecture](0001-inner-outer-loop-architecture.md) — The SDK wraps the inner loop; Orchestrator handles both loops
- [PHILOSOPHY.md](../whitepaper/PHILOSOPHY.md) — Five immutable pillars preserved
- [EVOLUTION.md](../whitepaper/EVOLUTION.md) — Documents the v2.1 → v2.2 transition

## References

- [Express.js Middleware](https://expressjs.com/en/guide/using-middleware.html) — Inspiration for composable middleware pattern
- [Redux Middleware](https://redux.js.org/understanding/history-and-design/middleware) — Inspiration for beforeStep/afterStep lifecycle
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) — Compatibility target for Tier 1 opaque agents
- [CyberLoop v2.1 Paper](https://zenodo.org/records/18138161) — Semantic Kinematics theory
- [AICL v1.0 Paper](https://zenodo.org/records/17835680) — Original control loop architecture

---

**Decision made by:** Framework authors
**Date:** 2026-02-14
**Supersedes:** None (additive to ADR-0001)
**Superseded by:** None (current)
