# 🧠 CyberLoop

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![DOI](https://zenodo.org/badge/1072923533.svg)](https://doi.org/10.5281/zenodo.17835643)
[![PR Checks](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml/badge.svg?branch=main)](https://github.com/roackb2/cyberloop/actions/workflows/pr-checks.yml)

### The Thermodynamics of Intelligence

> **"Stop building open-loop agents. They drift. They fail. They burn money."**

![Thermodynamics of Agent Reasoning](./docs/images/concept-graph.png)

> *Figure 1: Conceptual model of stability in Agentic Systems. Standard agents (Red) tend to accumulate semantic entropy over time. CyberLoop (Blue) aims to dampen this oscillation through closed-loop feedback.*

**CyberLoop** is the reference implementation of **AICL (Artificial Intelligence Control Loop)** — a framework that treats Agentic Reasoning not as a prompt engineering problem, but as a **Control Theory problem**.

Most agents today are **Open Loop**: they generate tokens based on probability, accumulating semantic entropy with every step. CyberLoop is **Closed Loop**: it introduces **Deterministic Probes** (Sensors) and **Relaxation Ladders** (Actuators) to enforce convergence towards a goal.

---

## ⚡️ Performance & Validation

CyberLoop is domain-agnostic. We validate its control mechanics across different problem spaces using the exact same control architecture.

### 1. Mechanism Demo: GitHub Repository Search

*(Run this locally to see the control loop in action)*

This demo illustrates how CyberLoop's **Inner Loop** handles exploration mechanics (narrowing/broadening) without burning LLM tokens on every step. While modern LLMs often memorize popular repos, this demo proves the **self-correcting behavior** of the framework when facing search constraints.

- **Query:** `"node graceful shutdown"`
- **Mechanism:** The agent uses **Probes** as gradient signals. When a search yields 0 hits, the probe fails, triggering a deterministic strategy switch (e.g., Narrow → Broaden) without LLM intervention.
- **Run it:** `yarn examples:github`

| Step | Action | Logic |
|------|--------|-------|
| 0 | `narrow` | Initial strategy |
| ... | ... | ... |
| 5 | `narrow` | **Probe Failed (no-hits)**: Gradient signal detected |
| 6 | `stop` | **Budget Exhausted**: Bounded exploration triggered |

### 2. Industrial Case Study: Root Cause Analysis (RCA)

*(Internal Benchmark on OpenTelemetry Data)*

To stress-test the framework in a high-dimensional production environment (where the answer isn't in the LLM's training set), we implemented a private **RCA Adapter** using CyberLoop to analyze distributed tracing data.

Compared to a standard Tool-Using Agent (GPT-5):

| Metric | Standard Agent | CyberLoop (AICL) | Impact |
| :--- | :--- | :--- | :--- |
| **LLM Calls** | 13 calls | **2 calls** | **85% reduction** (Solved inference cost) |
| **Execution Time** | 109s | **71s** | **34% faster** (Deterministic inner loops) |
| **Infinite Loops** | Occasional | **Zero** | Idempotency detection |
| **Convergence** | Probabilistic | **Mathematical** | Guided by Ladder |

> *Note: While the RCA domain adapter is proprietary, the underlying control logic is identical to the open-source GitHub demo.*

---

## 🧬 Core Philosophy: Hierarchical Control

We replace "Prompting" with a **System 1 / System 2** architecture:

### 1. Inner Loop (Reflexive System)

- **Role:** Fast, cheap, deterministic exploration.

- **Cost:** ~$0.01 per step.
- **Mechanism:** Uses **Probes** (Sensors) to detect if a path is viable, and **Ladders** to adjust exploration intensity.
- **Key Constraint:** **Zero LLM calls allowed.**

### 2. Outer Loop (Strategic System)

- **Role:** Slow, expensive, semantic planning.

- **Cost:** ~$0.50 per call.
- **Mechanism:** The LLM acts as the "Controller", setting the initial strategy and evaluating the final state found by the Inner Loop.

> 📖 **Read the Deep Dive:**
>
> - [**The Whitepaper (AICL)**](./docs/whitepaper/AICL.md) - Theoretical foundation & architecture.
> - [**Philosophy**](./docs/whitepaper/PHILOSOPHY.md) - Why Control Theory is the missing link for AGI.

---

## 🛠️ Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/roackb2/cyberloop.git
cd cyberloop

# Install dependencies
yarn install
```

### Running the Demos

You will need an `OPENAI_API_KEY` and a `GITHUB_TOKEN`.

```bash
# 1. Run the AICL Agent (Closed Loop)
# Watch it broaden/narrow its search based on probe feedback
yarn examples:github

# 2. Run the Baseline Comparison
# Compare results with a standard "flat" agent
yarn examples:github:baseline
```

---

## 🏗️ Architecture & Modules

CyberLoop is built on modular, swappable interfaces.

| Module | Role | Loop Layer |
|--------|------|------|
| `Environment` | Provides observable states and executes actions | Both |
| `ProbePolicy` | **Deterministic** decision logic based on probe signals | **Inner** |
| `Probe` | Low-cost feasibility checks (e.g., "Is result set empty?") | **Inner** |
| `Ladder` | Regulates exploration entropy (Relaxation Gradient) | **Inner** |
| `Planner` | LLM-based strategy and final evaluation | **Outer** |
| `BudgetTracker`| Hard constraints on token/step usage | Both |

See [**Inner/Outer Loop Architecture**](./docs/architecture/inner-outer-loop.md) for the detailed sequence diagram.

---

## 📂 Documentation Index

- **Theory:** [AICL Whitepaper](./docs/whitepaper/AICL.md) | [Philosophy](./docs/whitepaper/PHILOSOPHY.md)
- **Design:** [Engineering Guardrails](./docs/architecture/ENGINEERING_GUARDRAILS.md) | [Trace Spec](./docs/architecture/RUNTIME_TRACE_SPEC.md)
- **Applications:** [Use Cases Appendix](./docs/architecture/use-cases-appendix.md) (RCA, Code Search, Knowledge Retrieval)
- **Academic:** [Zenodo Record](https://zenodo.org/records/17835680) (Cite as Liang, 2025)

---

> **Status:** 🧩 *Work in Progress (Research Preview)*
>
> Uncontrolled intelligence grows powerful but fragile.
> Controlled intelligence grows stable — and endures.

📜 Licensed under the [Apache 2.0 License](./LICENSE)
© 2025 Jay / Fienna Liang (<roackb2@gmail.com>)
