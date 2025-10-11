# Engineering Guardrails · AICL / CyberLoop

This document defines the non-negotiable engineering constraints that ensure AICL-based systems remain deterministic, reproducible, and domain-agnostic.

---

## 1. Inner Loop Determinism
- ❌ No LLM calls in the **inner loop**.
- ✅ `ProbePolicy.decide()` must be pure and deterministic — no I/O, ≤50ms runtime.
- ✅ All inner-loop decisions must be unit-testable with fixed seeds.
- Actions must be serializable (`JSON.stringify(action)` must succeed).

---

## 2. Side-Effects Boundary
- All external side effects (API calls, file I/O, DB writes) must occur **only in** `Environment.apply()`.
- Evaluators, Probes, Policies, and Ladder updates are pure and side-effect-free.
- No global state mutations outside of `Environment`.

---

## 3. Budgets and Call Limits
- **Budgets are hard limits**, not soft suggestions.
- Inner loop (ProbePolicy): cheap deterministic exploration; cost ≤ inner budget.
- Outer loop (Planner): strategic decisions; ≤3 calls total (`plan`, `evaluate`, `replan`).
- Execution must terminate automatically when any budget is exhausted.

---

## 4. State and Logging
- Each step creates a **new immutable state** — no in-place mutations.
- Structured JSON logs must record:
  - Step number, action, ladder level, feedback, cost, stability signal.
  - State hash and time spent.
- Logs must be reproducible given the same seed.

---

## 5. Ladder Semantics
- Ladder controls **exploration intensity only** (e.g., thresholds, step size).
- Ladder must never override the final decision of the ProbePolicy.

---

## 6. Core vs. Domain Separation
- `src/core/*` must remain **domain-agnostic**.
- Domain-specific logic (e.g., GitHub, Confluence, SQL) must live in adapters.
- No API keys or credentials should appear in `core/` or shared utility code.

---

## 7. Reproducibility
- All stochastic processes must be seeded (`seed: number` in config).
- Configs and budgets must be serialized in the run report.
- Re-running the same configuration should produce identical traces.

---

## 8. Strategy Switching
- `StrategySelector` may run only:
  - After a classified failure type, or
  - At outer-loop boundaries.
- Never during the inner-loop iteration.

---

## 9. Logging & Metrics Governance
- Logs must conform to [RUNTIME_TRACE_SPEC.md](./RUNTIME_TRACE_SPEC.md).
- Metrics must include latency, cost units, entropy, and redundancy.

---

## 10. Compliance Checklist (CI)
| Check | Description | Required |
|-------|--------------|-----------|
| `no-llm-in-inner-loop` | Ensure no LLM APIs in ProbePolicy | ✅ |
| `pure-functions` | Ensure deterministic functions | ✅ |
| `budget-limit` | Verify budget enforcement | ✅ |
| `trace-conformance` | Verify trace matches runtime schema | ✅ |
| `core-domain-isolation` | Ensure no domain imports in core | ✅ |

---
