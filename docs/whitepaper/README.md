# AICL Whitepaper Documentation

Welcome to the AICL (Artificial Intelligence Control Loop) documentation.

---

## 📚 Documentation Structure

### Core Documents

| Document | Purpose | Audience | Status |
|----------|---------|----------|--------|
| **[PHILOSOPHY.md](PHILOSOPHY.md)** | Timeless principles | Everyone | Immutable |
| **[AICL.md](AICL.md)** | Current implementation | Developers, Researchers | v0.3 (Current) |
| **[COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)** | How components work together | Developers, IDE Assistants | Living |
| **[EVOLUTION.md](EVOLUTION.md)** | Why things changed | Contributors, Researchers | Living |

### Supporting Documents

| Document | Purpose |
|----------|---------|
| **[versions/](versions/)** | Archived whitepaper versions |
| **[versions/README.md](versions/README.md)** | Version history and citations |

---

## 🎯 Start Here

### For First-Time Readers

1. **[PHILOSOPHY.md](PHILOSOPHY.md)** - Understand the core principles (15 min read)
2. **[AICL.md](AICL.md)** - See current implementation (20 min read)
3. **[COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)** - Learn how it works (30 min read)

### For Developers

1. **[COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)** - Understand component wiring
2. **[AICL.md](AICL.md)** - Current architecture and interfaces
3. **[PHILOSOPHY.md](PHILOSOPHY.md)** - What must be preserved when extending

### For Researchers

1. **[PHILOSOPHY.md](PHILOSOPHY.md)** - Core theoretical foundations
2. **[EVOLUTION.md](EVOLUTION.md)** - How theory evolved through practice
3. **[versions/README.md](versions/README.md)** - Citation guidelines

### For IDE Assistants

1. **[PHILOSOPHY.md](PHILOSOPHY.md)** - Immutable principles to preserve
2. **[COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)** - How to use each component
3. **[AICL.md](AICL.md)** - Current interfaces and patterns

---

## 🧠 Core Philosophy (TL;DR)

AICL enables agents to **explore large decision spaces sustainably** through five immutable pillars:

1. **Gradient-Guided Exploration** - Multi-dimensional signals guide decisions
2. **Hierarchical Control** - Fast reflexes + slow strategy
3. **Modular Separation** - Components evolve independently
4. **Bounded Sustainability** - Explicit resource limits
5. **Convergence Through Stability** - Clear "good enough" criteria

**Key insight:** Provide agents with **internal gradient information** (not just rewards) to develop intuition about promising directions.

---

## 📖 Quick Concepts

### What is AICL?

A control-theoretic framework for building **sustainable, self-correcting AI agents** that can:
- Operate for extended periods (10-50+ iterations)
- Explore systematically using gradient information
- Converge reliably without exhausting resources
- Adapt without requiring system-wide prompt engineering

### Key Innovation

**Multi-dimensional gradients** instead of single reward signals:
- **Ladder** - Exploration intensity (0-1 scalar)
- **Probes** - Feasibility signals ("too narrow", "stuck", etc.)
- **Evaluator** - Progress feedback (improving/degrading)
- **History** - Trajectory context (what's been tried)

### Architecture

```
Outer Loop (Strategic, 2-3 LLM calls):
  ├─ Planner: Creates strategy
  ├─ Inner Loop (Reflexive, 10-50 iterations):
  │   ├─ Probes: Cheap gradient signals
  │   ├─ ProbePolicy: Deterministic decisions
  │   ├─ Environment: Apply actions
  │   ├─ Evaluator: Measure progress
  │   └─ Ladder: Adjust intensity
  └─ Planner: Evaluate results
```

---

## 🔄 Version History

| Version | Date | Key Changes | Status |
|---------|------|-------------|--------|
| **v0.3** | 2025-10 | Hierarchical inner/outer loops | **Current** |
| v0.2 | 2025-03 | Added Probe, Budget, Selector | Superseded |
| v0.1 | 2025-01 | Original concept | Historical |

See [versions/README.md](versions/README.md) for detailed version comparison and citation guidelines.

---

## 📝 Citation

### Current Version

```bibtex
@techreport{liang2025aicl,
  title={AICL: Artificial Intelligence Control Loop},
  author={Liang, Jay (Fienna)},
  year={2025},
  institution={CyberLoop Project},
  note={Version 0.3},
  url={https://github.com/roackb2/cyberloop}
}
```

### Core Philosophy

```bibtex
@techreport{liang2025aicl_philosophy,
  title={AICL Core Philosophy: Timeless Principles for Controlled Intelligence},
  author={Liang, Jay (Fienna)},
  year={2025},
  institution={CyberLoop Project},
  note={Immutable principles document},
  url={https://github.com/roackb2/cyberloop/blob/main/docs/whitepaper/PHILOSOPHY.md}
}
```

---

## 🤝 Contributing

When proposing changes:

1. **Read [PHILOSOPHY.md](PHILOSOPHY.md)** - Understand what cannot change
2. **Read [EVOLUTION.md](EVOLUTION.md)** - Understand why things changed
3. **Propose changes** that preserve the five core pillars
4. **Document reasoning** in EVOLUTION.md if making architectural changes

---

## 📧 Questions?

- **General questions:** Open an issue on GitHub
- **Research collaboration:** Contact roackb2@gmail.com
- **Implementation help:** See [COMPONENT_INTERACTIONS.md](COMPONENT_INTERACTIONS.md)

---

## 📄 License

All documentation licensed under Apache-2.0.

© 2025 Jay / Fienna Liang
