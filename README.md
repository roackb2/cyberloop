# 🧠 CyberLoop

[![PR Checks](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml/badge.svg?branch=main)](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

### Reference Implementation of AICL (Artificial Intelligence Control Loop)

> **Status:** 🧩 *Work in Progress (early-stage research and prototyping)*

> Uncontrolled intelligence grows powerful but fragile.
> Controlled intelligence grows stable — and endures.

---

## Overview

**CyberLoop** is the reference implementation of **AICL (Artificial Intelligence Control Loop)** —
a control-theoretic framework for building **sustainable, self-correcting intelligent systems**.

AICL models intelligence as a **closed feedback loop** with **hierarchical control architecture**:

### Core Modules

| Module | Role | Loop |
|--------|------|------|
| `Environment` | Provides observable states and executes actions | Both |
| `ProbePolicy` | Fast, deterministic action decisions based on probe signals | Inner |
| `Planner` | Strategic planning and replanning using LLM reasoning | Outer |
| `Evaluator` | Measures progress and stability after each step | Inner |
| `Ladder` | Regulates exploration intensity (relaxation gradient) | Inner |
| `Probe` | Performs low-cost feasibility checks (gradient signals) | Inner |
| `BudgetTracker` | Tracks and constrains exploration cost | Both |

### Hierarchical Control Architecture

#### Inner Loop (Fast, Deterministic)

- ProbePolicy makes rapid decisions based on probe signals
- No LLM calls, deterministic and reproducible
- High frequency, low cost per step
- Controlled by ControlBudget.innerLoop

#### Outer Loop (Strategic, Deliberative)

- Planner handles initial planning, evaluation, and replanning
- LLM-based reasoning for semantic understanding
- Low frequency (2-3 calls total), high cost per call
- Controlled by ControlBudget.outerLoop

Together, these form a reusable architecture for developing **agentic systems** that can explore unknown domains while maintaining stability and bounded cost.

---

## Goals

- 🔁 **Controlled Intelligence** — build agents that adapt stably, not just optimally
- 🧩 **Interface-Driven Design** — plug in domain-specific adapters with clear contracts
- 🧠 **Sustainable Learning** — maintain coherence under dynamic, uncertain environments
- ⚡ **Hierarchical Control** — separate fast deterministic exploration from strategic planning

---

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/roackb2/cyberloop.git
cd cyberloop

# Install dependencies
yarn install
```

### Running Examples

```bash
# Run the GitHub agent demo (requires GITHUB_TOKEN and OPENAI_API_KEY)
yarn examples:github

# Run the baseline comparison demo
yarn examples:github:baseline

# Set environment variables
# Create a .env file with:
# GITHUB_TOKEN=your_github_token
# OPENAI_API_KEY=your_openai_key
# GITHUB_AGENT_QUERY="your search query"  # optional, defaults to "node graceful shutdown"
```

The GitHub demo demonstrates the inner/outer loop architecture:

- **Outer loop**: Planner creates initial search strategy using LLM
- **Inner loop**: ProbePolicy systematically explores GitHub repositories
- **Probes**: Check result quality and redundancy
- **Ladder**: Adjusts exploration intensity based on feedback
- **Budget**: Tracks and limits both inner (exploration) and outer (LLM) costs

The demo prints per-step logs showing action, score, ladder level, and remaining budget to illustrate how the control loop stabilizes exploration.

### Example Output

**[📊 Honest Comparison: AICL vs Baseline](./docs/examples/baseline-comparison.md)** - When does AICL actually help?

**[🎯 GitHub Agent Demo](./docs/examples/github-agent-demo.md)** - Complete walkthrough with actual output

**What AICL provides:**

- ✅ Bounded exploration (budget tracking, stagnation detection)
- ✅ Probe-based failure detection (gradient signals)
- ✅ Reproducible control structure
- ⚠️ **Trade-off**: Added complexity and cost vs simple LLM agents

---

## Project Structure

```
.
├── src/
│   ├── core/
│   │   ├── interfaces/  # Core AICL interfaces (Environment, ProbePolicy, Planner, Evaluator, Ladder, Probe, BudgetTracker)
│   │   ├── budget/      # Budget tracking implementations (ControlBudget for inner/outer loops)
│   │   ├── evaluators/  # Evaluator implementations
│   │   ├── ladder/      # Ladder implementations
│   │   ├── probes/      # Built-in probes (EntropyProbe, HitCountProbe)
│   │   └── types.ts     # Shared type definitions
│   ├── adapters/        # Domain-specific adapters
│   │   ├── dep-solver/  # Dependency solver example
│   │   └── github/      # GitHub search example
│   ├── reference/       # Reference implementations for optional meta-control
│   ├── examples/        # Runnable demos
│   └── types/           # Additional type definitions
├── docs/
│   ├── architecture/    # Architecture documentation
│   │   ├── ENGINEERING_GUARDRAILS.md  # Engineering constraints
│   │   ├── GLOSSARY.md                # Term definitions
│   │   ├── inner-outer-loop.md        # Hierarchical control architecture
│   │   ├── RUNTIME_TRACE_SPEC.md      # Logging specification
│   │   ├── TESTING_GUIDE.md           # Testing requirements
│   │   └── use-cases-appendix.md      # Use case scenarios
│   ├── examples/        # Example walkthroughs with output
│   ├── whitepaper/      # AICL Whitepaper
│   └── adr/             # Architecture Decision Records
├── tests/               # Unit, integration, and E2E tests
└── README.md
```

---

## Key Concepts

### Control Flow

The AICL framework follows a hierarchical control pattern:

1. **Outer Loop - Planning Phase**
   - `Planner.plan(userInput)` → creates initial state
   - Cost: ~2.0 units (outer loop budget)

2. **Inner Loop - Exploration Phase** (repeats until stable or budget exhausted)
   - Run `Probe.test(state)` → get gradient signals
   - `ProbePolicy.decide(state, ladder)` → choose action (deterministic)
   - `Environment.apply(action)` → execute and get next state
   - `Evaluator.evaluate(prev, next)` → measure progress
   - `Ladder.update(feedback)` → adjust exploration intensity
   - Check `ProbePolicy.isStable(state)` → stop if stable

3. **Outer Loop - Evaluation Phase**
   - `Planner.evaluate(state, history)` → produce final output
   - Cost: ~2.0 units (outer loop budget)

4. **Outer Loop - Recovery Phase** (if needed)
   - `Planner.replan(state, history)` → try different strategy
   - Cost: ~2.0 units (outer loop budget)
   - Reset inner budget and return to step 2

### Engineering Guardrails

The framework enforces strict engineering constraints to ensure determinism and reproducibility:

- **No LLM calls in inner loop** - ProbePolicy must be deterministic
- **Side effects only in Environment.apply()** - All other components are pure
- **Hard budget limits** - Execution terminates when budget exhausted
- **Immutable state** - Each step creates new state, no mutations
- **Domain-agnostic core** - Domain logic stays in adapters
- **Reproducible traces** - Same seed produces identical results

See [ENGINEERING_GUARDRAILS.md](./docs/architecture/ENGINEERING_GUARDRAILS.md) for complete details.

### Use Cases

The framework excels in scenarios with:

- **Large, complex search spaces** - Where naive exploration gets lost
- **Hard budget constraints** - When LLM costs must be strictly controlled
- **Systematic exploration requirements** - Where missing a solution is costly
- **Reproducibility requirements** - Where audit trails matter

**Recommended domains:**

- Private knowledge retrieval (Notion/Confluence/Wiki)
- Code bug localization in large codebases
- Multi-file code refactoring
- Academic literature review
- API endpoint discovery
- Database query optimization

See [use-cases-appendix.md](./docs/architecture/use-cases-appendix.md) for detailed scenarios and benchmarks.

---

## Core Interfaces

The framework is built on a set of composable TypeScript interfaces:

### Primary Interfaces (Active in Inner/Outer Loop)

```typescript
// Environment - Provides state and executes actions
interface Environment<S, A> {
  observe(): Promise<S> | S
  apply(action: A): Promise<S>
}

// ProbePolicy - Fast, deterministic decision-making (Inner Loop)
interface ProbePolicy<S, A, F> extends Policy<S, A, F> {
  initialize(state: S): void
  isStable(state: S): boolean
  decide(state: S, ladder: Ladder<F>): Promise<A> | A
}

// Planner - Strategic planning and replanning (Outer Loop)
interface Planner<S> {
  plan(input: string): Promise<S>
  evaluate(state: S, history: S[]): Promise<string>
  replan(state: S, history: S[]): Promise<S | null>
}

// Evaluator - Measures progress and stability
interface Evaluator<S, F> {
  evaluate(prev: S, next: S): F | Promise<F>
}

// Ladder - Regulates exploration intensity
interface Ladder<F> {
  update(feedback: F): void
  level(): number
}

// Probe - Low-cost feasibility checks
interface Probe<S, R> {
  id: string
  test(state: S): Promise<R> | R
}

// BudgetTracker - Enforces resource limits
interface BudgetTracker {
  record(cost: number): void
  remaining(): number
  shouldStop(): boolean
}
```

### Optional Meta-Control Interfaces

These interfaces support advanced scenarios but are not required for basic usage:

- **`Policy`** - Base policy interface (extended by ProbePolicy)
- **`StrategySelector`** - Multi-strategy routing based on failure types
- **`FailureClassifier`** - Diagnoses complex failure modes
- **`TerminationPolicy`** - Multi-objective stopping criteria

**Reference implementations** are provided in `src/reference/` for learning purposes. Most applications use a single ProbePolicy and don't need these components. See the GitHub adapter for the recommended pattern.

---

## Documentation

### Architecture

- [📐 Inner/Outer Loop Architecture](./docs/architecture/inner-outer-loop.md) - Hierarchical control design
- [📋 Glossary](./docs/architecture/GLOSSARY.md) - Term definitions
- [🛡️ Engineering Guardrails](./docs/architecture/ENGINEERING_GUARDRAILS.md) - Non-negotiable constraints
- [📊 Runtime Trace Spec](./docs/architecture/RUNTIME_TRACE_SPEC.md) - Logging specification
- [🧪 Testing Guide](./docs/architecture/TESTING_GUIDE.md) - Testing requirements
- [💡 Use Cases](./docs/architecture/use-cases-appendix.md) - When to use this framework

### Whitepaper & Examples

- [📜 AICL Whitepaper](./docs/whitepaper/AICL.md) - Theoretical foundation
- [🎯 GitHub Agent Demo](./docs/examples/github-agent-demo.md) - Complete walkthrough
- [📊 Baseline Comparison](./docs/examples/baseline-comparison.md) - When AICL helps vs baseline

---

📜 Licensed under the [Apache 2.0 License](./LICENSE)
© 2025 Jay / Fienna Liang (<roackb2@gmail.com>)
