# 🧠 CyberLoop

### Reference Implementation of AICL (Artificial Intelligence Control Loop)

> **Status:** 🧩 *Work in Progress (early-stage research and prototyping)*

> Uncontrolled intelligence grows powerful but fragile.
> Controlled intelligence grows stable — and endures.

---

## Overview

**CyberLoop** is the reference implementation of **AICL (Artificial Intelligence Control Loop)** —
a control-theoretic framework for building **sustainable, self-correcting intelligent systems**.

AICL models intelligence as a **closed feedback loop** consisting of **seven key modules**:

| Module | Role |
|--------|------|
| `Environment` | Provides observable states and constraints |
| `Policy` | Generates actions and adapts to feedback |
| `Evaluator` | Measures performance and stability |
| `Ladder` | Regulates exploration vs. exploitation (the “relaxation ladder”) |
| `Probe` | Performs low-cost deterministic feasibility checks |
| `BudgetTracker` | Tracks and constrains exploration cost |
| `StrategySelector` | Dynamically switches control policies when the current strategy fails |

Together, these form a reusable architecture for developing **agentic systems** that can explore unknown domains while maintaining stability and bounded cost.

---

## Goals

- 🔁 **Controlled Intelligence** — build agents that adapt stably, not just optimally
- 🧩 **Interface-Driven Design** — plug in domain-specific adapters with clear contracts
- 🧠 **Sustainable Learning** — maintain coherence under dynamic, uncertain environments
- 🌍 **Open Source Research Platform** — validate the AICL framework across domains (e.g., dependency solving, query refinement, knowledge retrieval)

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/roackb2/cyber-loop.git
cd cyber-loop

# Install dependencies
yarn install

# Run the numeric quickstart loop
yarn examples:quickstart

# Run the GitHub query refinement demo (mock API)
yarn examples:github "node graceful shutdown"

# Run the GitHub + OpenAI agent demo (requires GITHUB_TOKEN and OPENAI_API_KEY)
yarn examples:github:agent "node graceful shutdown"

# Tip: create a .env file with GITHUB_TOKEN and OPENAI_API_KEY, then run `node -r dotenv/config ...` if you prefer loading automatically.
GITHUB_AGENT_QUERY can be set in .env to change the default seed query.
```

The GitHub demo prints per-step logs (action, score, ladder level, remaining budget) and highlights probe blocks, strategy switches, and stop reasons to illustrate how the control loop stabilises exploration.

### Example Output

See a complete walkthrough with actual agent output: **[GitHub Agent Demo: Intelligent Repository Search](./docs/examples/github-agent-demo.md)**

**What it demonstrates:**
- ✅ Probes as gradient signals (not hard blockers)
- ✅ Self-correcting exploration (narrow → broaden when stuck)
- ✅ Actionable intelligence (answers with code examples)
- ✅ Bounded resource use (budget tracking, stagnation detection)

---

## Project Structure

```
.
├── src/
│   ├── core/            # AICL core loop (Environment, Policy, Evaluator, Ladder, Probe, BudgetTracker, StrategySelector)
│   ├── adapters/        # Domain adapters (e.g. dep-solver, github-query, knowledge-synth)
│   ├── examples/        # Experimental demos
│   └── utils/           # Shared interfaces and helpers
├── docs/
│   ├── examples/        # Example walkthroughs with output
│   └── whitepaper/      # AICL Whitepaper v0.2
└── README.md
```

---

## References

- [📜 AICL Whitepaper v0.2](./docs/whitepaper/AICL_Whitepaper_v0.2.md)
- [🎯 Vision Note: Controlled Sustainable Intelligence](https://github.com/roackb2/cyber-loop/discussions)

---

**© 2025 Jay / Fienna Liang**
Licensed under **Apache-2.0**
