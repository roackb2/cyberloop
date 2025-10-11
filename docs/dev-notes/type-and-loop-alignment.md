# 🧩 Type & Loop Alignment Notes

> **Purpose:**
> To align current `core/interfaces` and control loop implementations (`orchestrator`, `loop`, `defaults`)
> with the **AICL control framework principles** — ensuring determinism, reproducibility, and traceability.

---

## 🎯 Objective

This guide defines the engineering alignment tasks to eliminate drift between:

- **Type-level contracts** (interfaces under `src/core/interfaces`)
- **Loop implementation** (`orchestrator.ts`, `loop.ts`)
- **AICL design principles** (as described in `/docs/architecture`)

---

## 🧠 Core Principles to Uphold

| Principle | Rationale | Enforcement Target |
|------------|------------|---------------------|
| **Inner loop = deterministic, synchronous, I/O-free** | Ensures reproducibility and fast bounded control | `ProbePolicy.decide()`, `exploreInnerLoop()` |
| **Outer loop = strategic, expensive, gated** | Preserves cost control and hierarchy | `Planner.plan/evaluate/replan`, `ControlBudget` |
| **State immutability** | Enables replays and golden traces | `Environment.apply`, `Evaluator.evaluate` |
| **Budget as hard limits** | Prevents runaway costs | `ControlBudget`, `Orchestrator.guardOuterCallOrThrow` |
| **Structured I/O** | Prevents prompt drift | `PlannerInput`, `PlannerOutput`, `PlannerPlan` |
| **JSON-safe logging** | Guarantees trace stability | `StepLog`, `RUNTIME_TRACE_SPEC` |
| **Defaults centralization** | Allows reproducible experiments | `defaults.ts` |

---

## 🧩 Type System Alignment Tasks

### 1. ProbePolicy Interface

**Current issue:** `decide()` allows `Promise`, enabling async or LLM calls.
**Target:** make `decide()` synchronous and deterministic.

```ts
export interface ProbePolicy<S, A, F> {
  initialize(state: S): void
  decide(state: S, ladder: Ladder<F>): A // ← must be sync, pure, no I/O
  isStable(state: S): boolean
  adapt?(feedback: F, ladder: Ladder<F>): void
}
```

✅ **Verification:**

- No `await` calls in `decide()` or its downstream methods.
- Unit test: same input always → same action.

---

### 2. Planner Interface

**Current issue:** freeform string I/O; non-verifiable.

**Replace with structured contracts:**

```ts
export interface Planner<S> {
  plan(input: PlannerInput): Promise<PlannerPlan<S>>
  evaluate(state: S, history: S[]): Promise<PlannerOutput>
  replan(state: S, history: S[]): Promise<PlannerPlan<S> | null>
}
```

Where:

```ts
export type PlannerInput = { query: string; seed: number; corpusHints?: string[] }
export type PlannerPlan<S> = {
  objective: string
  constraints?: {
    outerMaxCalls?: number
    stability?: { hitsMin?: number; hitsMax?: number; consecutive?: number }
    redundancyMax?: number
  }
  initialState: S
}
export type PlannerOutput = JsonValue
```

✅ **Verification:**

- All Planner outputs are JSON-serializable.
- No raw text prompt dependencies.

---

### 3. Environment Interface

Add serialization helpers for logging.

```ts
export interface Environment<S, A> {
  observe(): Promise<S> | S
  apply(action: A): Promise<S>
  serialize?(state: S): JsonValue
  hash?(state: S): string
}
```

✅ **Verification:**

- Step logs store either hash or serialized form, not full state object.

---

### 4. Budget System

**Add:** `kind: 'inner' | 'outer'` + `exceeds(cost)` preflight gate.

```ts
export interface BudgetTracker {
  readonly kind: 'inner' | 'outer'
  record(cost: Cost): void
  remaining(): number
  shouldStop(): boolean
  exceeds?(cost: Cost): boolean
  reset?(value?: Cost): void
}
```

✅ **Verification:**

- Outer planner calls gated by `guardOuterCallOrThrow()`.
- Logs contain remaining budgets after each step.

---

### 5. Defaults

Centralize all constants in `src/core/defaults.ts`:

```ts
export const DEFAULTS = {
  MAX_INNER_STEPS: 50,
  INNER_PROBE_COST: 0.05,
  INNER_DECIDE_COST: 0.1,
  OUTER_CALL_COST: 2.0,
  STABILITY: { hitsMin: 10, hitsMax: 30, consecutive: 2 },
  REDUNDANCY_MAX: 0.15,
  REQUIRE_SEED: true,
} as const
```

✅ **Verification:**

- No hardcoded numeric constants in orchestrator or loop.
- Benchmarks refer to DEFAULTS.

---

## 🔁 Orchestrator Alignment

### Required behavior

| Stage | Description | Verification |
|--------|--------------|--------------|
| **Outer #1** | `planner.plan` gated by budget | throws if `exceeds(OUTER_CALL_COST)` |
| **Inner loop** | Deterministic exploration | ProbePolicy + Ladder only |
| **Outer #2** | `planner.evaluate` only after stable | cost recorded |
| **Outer #3** | `planner.replan` only when inner exhausted | cost recorded |
| **Logging** | JSON-safe trace, reproducible order | conforms to RUNTIME_TRACE_SPEC |

### Pseudocode Reference

```ts
this.guardOuterCallOrThrow()
const plan = await planner.plan({ query: userInput, seed })
budget.outerLoop.record(DEFAULTS.OUTER_CALL_COST)

const result = await this.exploreInnerLoop(plan.initialState)
if (result.status === 'stable') {
  this.guardOuterCallOrThrow()
  const output = await planner.evaluate(result.state, result.history)
  budget.outerLoop.record(DEFAULTS.OUTER_CALL_COST)
}
```

✅ **Verification:**

- Outer loop calls ≤ 3.
- `logs.length` === number of inner iterations.
- No async calls inside `decide()` or `runProbesSync()`.

---

## ⚙️ Control Loop Kernel

### Split loops

1. `innerControlStep()` – pure deterministic step for ProbePolicy.
2. `controlLoop()` – generic retry-based kernel for async policies.

✅ **Verification:**

- `innerControlStep()` never awaits inside policy logic.
- Replay runs with fixed seed yield identical traces.

---

## 🧾 Trace Validation Criteria

Traces must satisfy the following schema:

```jsonc
{
  "meta": { "useCase": "private-doc-retrieval", "runId": "uuid", "seed": 42 },
  "config": { "budgets": { "inner": 20, "outer": 6 } },
  "events": [
    {
      "t": 0,
      "stateHash": "abc123",
      "action": "broaden_filter",
      "feedback": 0.6,
      "ladder": 0.5
    }
  ],
  "summary": { "converged": true, "steps": 12 }
}
```

✅ **Verification:**

- All traces are replayable.
- Re-running with same seed yields bit-identical JSON output.

---

## 🧪 Validation Checklist

| Category | Check | Result |
|-----------|--------|--------|
| **Determinism** | Inner loop produces same output for same seed | ☐ |
| **Cost Control** | Outer calls ≤ 3, budget stops loop | ☐ |
| **Logging** | JSON trace matches spec | ☐ |
| **Default Use** | No hardcoded constants | ☐ |
| **Planner Contract** | Returns structured JSON | ☐ |
| **Pure ProbePolicy** | No I/O or LLM calls | ☐ |
| **Trace Replay** | Identical runs w/ same seed | ☐ |

---

## ✅ Expected Outcome

After alignment:

- Orchestrator + interfaces strictly enforce **deterministic inner / gated outer**.
- IDEs (Windsurf, Cursor, etc.) can confidently autofix or extend types without semantic drift.
- Logs and traces will be stable, comparable, and suitable for research benchmarking.

---

**© 2025 Fienna Liang — CyberLoop / AICL Reference Implementation**
