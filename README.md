# 🧠 CyberLoop

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.17835643.svg)](https://doi.org/10.5281/zenodo.17835643)
[![PR Checks](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml/badge.svg?branch=main)](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml)

<h3 align="center">Express.js for your agent steps</h3>
<p align="center"><em>With built-in geometric control middlewares backed by published research</em></p>

---

## What is CyberLoop?

**CyberLoop** is a TypeScript middleware framework for AI agents. It wraps any agent
with a composable middleware stack that can **observe, annotate, and correct** each
step — without modifying the agent's core logic.

```typescript
import { cyberloop } from 'cyberloop'

const controlled = cyberloop(myAgent, {
  budget: { maxSteps: 20 },                    // stop runaway agents
  logger: pino(),                              // structured logging (auto-wired)
  middleware: [
    stagnationMiddleware(),                     // halt on feedback stagnation
    myCustomMiddleware(),                       // your own logic here
  ],
})

const result = await controlled.run('your query')
```

Think of it like Express.js for agents: Express composes middleware around HTTP
requests. CyberLoop composes middleware around agent steps. You stack middleware to
add whatever behavior you need — logging, guardrails, evaluation, drift detection —
and the framework handles the plumbing.

---

## Why Middleware for Agents?

Most agent frameworks give you **one way** to control behavior: prompt engineering.
CyberLoop gives you a **programmable observation layer** between each step:

| What you can do | How |
| --------------- | --- |
| **Budget & halt** | Stop after N steps, N tokens, or N dollars |
| **Log & trace** | Structured telemetry for every step |
| **Evaluate** | Run a small evaluator LLM after each step |
| **Detect drift** | Compare embeddings to a goal or reference trajectory |
| **Enforce policy** | Chain-of-thought guards, reflexes, backtracking |
| **Anything else** | Write a middleware with `beforeStep` / `afterStep` hooks |

Middleware communicates through **typed metadata channels** — one middleware writes
observations, another reads them. No coupling, no global state.

---

## Write Your Own Middleware

A middleware is an object with optional lifecycle hooks:

```typescript
import type { Middleware } from 'cyberloop'

function myEvalMiddleware(): Middleware {
  return {
    name: 'eval',

    // Runs before each agent step — inspect or modify context, or return 'halt'
    async beforeStep(ctx) {
      console.log(`Step ${ctx.step}: starting`)
      return ctx
    },

    // Runs after each agent step — inspect result, annotate metadata
    async afterStep(ctx, result) {
      const score = await evaluator.score(result.state)
      ctx.metadata['eval'] = { score, pass: score > 0.7 }
    },
  }
}
```

`beforeStep` hooks run in registration order. `afterStep` hooks run in reverse
(onion model). Return `'halt'` from `beforeStep` to stop the loop.

Stack it with any other middleware:

```typescript
const controlled = cyberloop(agent, {
  budget: { maxSteps: 50 },
  middleware: [
    myEvalMiddleware(),
    kinematicsMiddleware({ embedder, goalEmbedding }),  // built-in geometric control
  ],
})
```

---

## Built-in: Geometric Control Middlewares

CyberLoop ships with advanced middlewares grounded in **Control Theory** and
**Differential Geometry**, developed as part of the
[AICL research program](https://doi.org/10.5281/zenodo.17835643):

| Middleware | What it does | Geometric lens |
| ---------- | ------------ | -------------- |
| `kinematicsMiddleware` | EKF-filtered velocity + PID error relative to a goal embedding | Point in ℝ^d |
| `manifoldMiddleware` | Local PCA via k-NN, tangent/normal decomposition, curvature | Riemannian manifold |
| `grassmannianMiddleware` | Subspace tracking over sliding windows, geodesic distance to reference trajectory | Grassmannian Gr(k,d) |

Each writes to its own metadata channel (`kinematics`, `manifold`, `grassmannian`).
They compose independently and can be stacked.

<p align="center">
<img src="./docs/images/concept-graph.png" alt="Stability through closed-loop feedback" width="800">
</p>

<p align="center">
<em>Standard agents (Red) accumulate entropy over time.
CyberLoop (Blue) dampens oscillation through closed-loop feedback.</em>
</p>

> **The framework provides geometry. Your application provides semantics.**
> CyberLoop tells agents *where they are* relative to where they should be.
> It does NOT tell agents *what to do* — that's your job.

---

## ⚡ Quick Start

```typescript
import { cyberloop } from 'cyberloop'

// Tier 1: Wrap any agent — get budget control for free
const controlled = cyberloop(myAgent, { budget: { maxSteps: 20 } })
const result = await controlled.run('your query')

// Tier 2: Expose step-level control for middleware
const controlled = cyberloop(mySteppableAgent, {
  budget: { maxSteps: 50 },
  logger: pino(),
  middleware: [stagnationMiddleware()],
})

// Tier 3: Advanced — add geometric control
import { kinematicsMiddleware, manifoldMiddleware, grassmannianMiddleware } from 'cyberloop/advanced'
const controlled = cyberloop(mySteppableAgent, {
  middleware: [
    kinematicsMiddleware({ embedder, goalEmbedding }),
    manifoldMiddleware({ embedder, manifold: vectorDB }),
    grassmannianMiddleware({ embedder, windowSize: 10, trajectory: goldenArc }),
  ],
})
```

See [examples/quickstart.ts](src/examples/quickstart.ts) for a runnable 30-line demo.

---

## 🚀 Hero Demo: Project Ariadne

**Can an agent find the link between "Coffee" and the "French Revolution" without an LLM?**

Using CyberLoop's `kinematicsMiddleware`, the agent navigates Wikipedia using only
**Embeddings + PID Control**. It "senses" semantic proximity and reflexively corrects
course when it drifts.

### ⚡️ Run it yourself

```bash
# 1. Install dependencies
yarn install

# 2. Run the Deep-Dive Scenario (Coffee -> French Revolution)
# v2.2 SDK version (cyberloop wrapper + middleware):
yarn examples:wikipedia:cyberloop -- --scenario revolution

# Legacy Orchestrator version (all benchmark modes):
yarn examples:wikipedia -- --mode cyberloop --scenario revolution

```

### 📊 Benchmark Results

| Metric | Pure LLM Agent (Typical) | CyberLoop v2.1 (Actual) | Impact |
| --- | --- | --- | --- |
| **Decision Mechanism** | Reasoning (LLM) | **Sensing** (Vector + PID) | **Physiological** |
| **Latency per Step** | ~3,000ms | **~50ms** | **60x Faster** |
| **Cost per Step** | ~$0.01 | **~$0.0001** | **99% Cheaper** |
| **Behavior** | Stochastic | **Controlled** | Reproducible |

> 🔗 **See full benchmark:** [docs/benchmarks/wikipedia](docs/benchmarks/wikipedia/heading-comparisons/global-heading/benchmark-wikipedia-navigation.md)

---

## 🧬 Architecture

### The Middleware Stack

```text
Agent step → [budget] → [telemetry] → [kinematics] → [manifold] → [grassmannian] → result
                ↑                                                          ↓
                └──────────── ctx.metadata (typed channels) ←──────────────┘
```

Each middleware hooks into the step with `beforeStep` / `afterStep`. Metadata flows
through typed channels so middleware can communicate without coupling.

### Developer API: Three Tiers

| Tier | API | You Provide | CyberLoop Adds |
| --- | --- | --- | --- |
| **1. Opaque** | `cyberloop(agent)` | Any agent with `run()` | Budget, event hooks |
| **2. Steppable** | `cyberloop(steppableAgent)` | Agent with `step()`, `isDone()` | Per-step middleware |
| **3. Advanced** | `+ geometric middlewares` | Embedder + reference data | Drift detection, trajectory tracking |

### SDK vs Orchestrator

**SDK (`cyberloop()`)** — You own the outer loop. CyberLoop instruments the inner loop
with composable middleware. Best for adding control to existing agents.

**Orchestrator** — CyberLoop owns the full plan → explore → evaluate → replan cycle.
Legacy, preserved for research benchmarks.

👉 **[Full comparison →](docs/guide/choosing-your-api.md)**

---

## 📉 Industrial Validation

### Root Cause Analysis (RCA) Case Study

*(Internal Benchmark on OpenTelemetry Data)*

| Metric | Standard Agent | CyberLoop (AICL) | Impact |
| --- | --- | --- | --- |
| **LLM Calls** | 13 calls | **2 calls** | **85% reduction** |
| **Execution Time** | 109s | **71s** | **34% faster** |
| **Infinite Loops** | Occasional | **Zero** | Idempotency detection |

---

## 🛠️ Getting Started

### Installation

```bash
git clone https://github.com/roackb2/cyberloop.git
cd cyberloop
yarn install

```

### Configuration

Create a `.env` file with your keys:

```env
OPENAI_API_KEY=sk-...

```

### Available Demos

```bash
# --- SDK Examples ---
yarn examples:quickstart                          # Tier 1: opaque agent
yarn examples:middleware                           # Tier 2: steppable + custom middleware
yarn examples:openai-agents                        # OpenAI Agents SDK compatibility

# --- Wikipedia Navigation (Semantic Kinematics) ---
yarn examples:wikipedia:cyberloop                  # SDK version (cyberloop wrapper)
yarn examples:wikipedia:cyberloop -- --scenario revolution
yarn examples:wikipedia                            # Legacy Orchestrator (all modes)

# --- GitHub Search (Deterministic State Machine) ---
yarn examples:github:cyberloop                     # SDK version (steppable agent)
yarn examples:github:baseline:cyberloop            # SDK version (OpenAI Agent)
yarn examples:github                               # Legacy Orchestrator
yarn examples:github:baseline                      # Legacy baseline

```

---

## 📂 Documentation

* **Guide:** [Choosing Your API — SDK vs Orchestrator](docs/guide/choosing-your-api.md)
* **Benchmarks:** [Wikipedia Navigation Results](docs/benchmarks/wikipedia/heading-comparisons/global-heading/benchmark-wikipedia-navigation.md)
* **Theory:** [AICL Whitepaper](docs/whitepaper/AICL.md)
* **Philosophy:** [Immutable Principles](docs/whitepaper/PHILOSOPHY.md)
* **Evolution:** [Why the architecture changed](docs/whitepaper/EVOLUTION.md)
* **Architecture:** [Inner/Outer Loop Spec](docs/architecture/inner-outer-loop.md)
* **Academic (v2.1):** Zenodo — [The Brain Needs a Body (Liang, 2026)](https://zenodo.org/records/18138161)
* **Academic (v1.0):** Zenodo — [AICL Whitepaper (Liang, 2025)](https://zenodo.org/records/17835680)

---

> **Status:** 🧪 *v4.0 — Middleware framework + geometric control*
> Uncontrolled intelligence grows powerful but fragile.
> Controlled intelligence grows stable — and endures.

📜 Licensed under the [Apache 2.0 License](./LICENSE)
© 2025 Jay / Fienna Liang ([roackb2@gmail.com](mailto:roackb2@gmail.com))
