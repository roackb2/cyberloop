# Private Knowledge Retrieval · AICL Spec Package

This directory contains the full specification and documentation set for the **Private Knowledge Retrieval** use case,
designed to validate the AICL Inner/Outer Loop framework in an enterprise document-search scenario (e.g., Notion or Confluence).

---

## 📘 Reading Order

1. **[brief.md](./brief.md)** — Use case overview (goal, inputs/outputs, constraints)
2. **[schema.md](./schema.md)** — State, Action, and Feedback type definitions
3. **[sequence.md](./sequence.md)** — Inner/Outer loop control flow and stability conditions
4. **[budget-metrics.md](./budget-metrics.md)** — Cost model and evaluation metrics
5. **[authoring-planner-probepolicy.md](./authoring-planner-probepolicy.md)** — Guide for implementing planner and deterministic probe policy
6. **[protocol-private-docs.md](./protocol-private-docs.md)** — Benchmark methodology and dataset setup
7. **[windsurf-brief.md](./windsurf-brief.md)** — Implementation sprint brief for Windsurf or IDE-based execution
8. **[report-schema.md](./report-schema.md)** — JSON output format for `npm run examples:pdr` (runtime result spec)

---

## 🧩 Folder Purpose

Each file in this folder represents a component of the AICL specification for a single domain adapter.
This structure can serve as a template for other domains (e.g., API discovery, query optimization).

```text
specs/
└── private-doc-retrieval/
    ├── brief.md
    ├── schema.md
    ├── sequence.md
    ├── budget-metrics.md
    ├── authoring-planner-probepolicy.md
    ├── protocol-private-docs.md
    ├── windsurf-brief.md
    └── report-schema.md
```

---

## 🧠 Core Principles Validated

- **Controlled exploration** via deterministic ProbePolicy
- **Bounded adaptation** through inner/outer budget control
- **Reproducible intelligence** (fixed-seed deterministic runs)
- **Transparency** with full trace logs and metrics auditability

---

## 🔗 Related Documents

- `/docs/whitepaper/aicl.md` — conceptual foundation of the control loop
- `/docs/architecture/inner-outer-loop.md` — architectural overview shared across domains
- `/docs/examples/github-agent-demo.md` — reference agent demonstration

---

## 🧪 Validation

Run the benchmark suite for this use case:

```bash
npm run examples:pdr
```

The output JSON must conform to [report-schema.md](./report-schema.md).
