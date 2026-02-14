# Testing Guide · AICL / CyberLoop

Defines the testing philosophy and mandatory test cases for core and adapter implementations.

---

## 1. Unit Tests

### 1.1 ProbePolicy

- Must produce **identical outputs** for identical inputs and seeds.
- Validate boundary conditions (too many hits → narrow, too few → broaden).
- Coverage goal: 100% decision branches.

### 1.2 Evaluator

- Fixed input states → identical feedback results.
- Verify numerical stability and monotonicity (improvement = positive delta).

### 1.3 Ladder

- Check that `update()` properly scales relaxation levels within [0, 1].
- Ladder should always converge (no oscillation).

### 1.4 BudgetTracker

- Record and remaining values must match expected arithmetic.
- Verify that exceeding budget triggers termination.

---

## 2. Integration Tests

### 2.1 Inner Loop

- Given a deterministic policy, a fixed seed should yield identical step traces.
- Validate convergence to a stable state within the step limit.

### 2.2 Outer Loop

- Test the full sequence: `plan → inner loop → evaluate → replan (optional)`.
- Ensure at most 3 Planner calls occur.

### 2.3 End-to-End

- Run the entire orchestrator with a mock environment.
- Verify that outputs conform to the [RUNTIME_TRACE_SPEC.md](./RUNTIME_TRACE_SPEC.md).

---

## 3. Property-Based Tests

- Validate invariants across random seeds (e.g., stability ∈ [0,1]).
- Budget must never go negative.
- Ladder levels must remain monotonic within each feedback regime.

---

## 4. Golden Trace Tests

- Generate a “golden” trace from a known seed and configuration.
- Future changes must reproduce the same JSON trace bit-for-bit.

---

## 5. Middleware Tests (v2.2 SDK)

### 5.1 Middleware Unit Tests

- Each middleware must test `beforeStep` and `afterStep` independently.
- `setup()` must reset internal state (e.g., `policyMiddleware` re-initializes on setup).
- `beforeStep` returning `'halt'` must stop the loop (e.g., `budgetMiddleware`).
- `afterStep` must correctly populate `ctx.metadata` (e.g., `policyMiddleware` stores `policyAction`).

### 5.2 Middleware Integration Tests

- Test middleware composition via `MiddlewareRunner` with multiple middleware.
- Verify `beforeStep` runs in registration order, `afterStep` in reverse order.
- Verify that halting in `beforeStep` skips `agent.step()` and triggers `onHalt`.

### 5.3 cyberloop() Wrapper Tests

- **Opaque agent:** `cyberloop(agentLike)` delegates to `agent.run()`.
- **Steppable agent:** `cyberloop(steppableAgent)` runs the step loop with middleware.
- **Budget halting:** Loop stops when `maxSteps` exceeded.
- **Event hooks:** `on.onHalt` fires on budget exhaustion.
- **Default middleware:** `budgetMiddleware` and `telemetryMiddleware` are auto-registered.

### 5.4 policyMiddleware Tests

- `decideAction(state)` delegates to `ChainPolicy.decide()`.
- Reflexes intercept before guards and base policy.
- Guards modify state before base policy sees it.
- `setup()` resets initialization state for re-runs.
- `afterStep` stores last action in metadata and feeds ladder on feedback.

---

## 6. CI Enforcement Rules

| Check | Description | Required |
|-------|-------------|-----------|
| `no-llm-in-inner-loop` | Detect LLM calls inside ProbePolicy | ✅ |
| `trace-schema-match` | Validate trace conforms to runtime schema | ✅ |
| `core-domain-isolation` | Prevent domain imports inside `core/` | ✅ |
| `budget-invariant` | Verify budget exhaustion triggers termination | ✅ |
| `deterministic-replay` | Ensure golden trace matches current output | ✅ |
| `middleware-lifecycle` | Verify setup/teardown called exactly once per run | ✅ |
| `middleware-order` | Verify beforeStep order and afterStep reverse order | ✅ |

---
