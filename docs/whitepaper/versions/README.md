# AICL Whitepaper Versions

This directory contains archived versions of the AICL whitepaper for historical reference and citation purposes.

---

## Current Version

**[v0.3 (2025-10)](../AICL.md)** - Hierarchical Inner/Outer Loop Architecture  
Status: **Current**  
[View Document](../AICL.md)

---

## Archived Versions

### [v0.2 (2025-03)](v0.2-with-probes.md)

**Title:** AICL v0.2 - With Probe, BudgetTracker, and StrategySelector

**Key Features:**
- Added Probe module for cheap feasibility checks
- Added BudgetTracker for resource regulation
- Added StrategySelector for policy switching
- Flat control loop architecture with 7 modules

**Architecture:**
```
User Input → StrategySelector → Policy → Probe → Environment
                ↓                  ↓         ↓
         FailureClassifier ← Evaluator ← Ladder
                                ↓
                          BudgetTracker
```

**Status:** Superseded by v0.3 hierarchical design  
**Cite as:** Liang, J. (2025). AICL v0.2: Artificial Intelligence Control Loop with Probe, BudgetTracker, and StrategySelector.

**Why it evolved:**
- Cost boundaries unclear (LLM calls could happen at multiple layers)
- Routing complexity added overhead for single-domain tasks
- Hard to predict and control LLM usage
- See [EVOLUTION.md](../EVOLUTION.md) for full story

---

### v0.1 (2025-01)

**Title:** AICL v0.1 - Original Concept

**Key Features:**
- Basic feedback loop with 4 core modules
- Environment, Policy, Evaluator, Ladder
- Simple control flow

**Architecture:**
```
Environment → Policy → Action → Environment
     ↓           ↑        ↓
 Evaluator ← Feedback ← Ladder
```

**Status:** Historical reference only (not fully implemented)  
**Cite as:** Liang, J. (2025). AICL v0.1: Artificial Intelligence Control Loop - Original Concept.

**Why it evolved:**
- Needed gradient information beyond just Ladder
- Required resource tracking (budget)
- Needed feasibility checks (probes)
- See [EVOLUTION.md](../EVOLUTION.md) for full story

---

## Version Comparison

| Feature | v0.1 | v0.2 | v0.3 |
|---------|------|------|------|
| **Core Modules** | 4 | 7 | 8 |
| **Architecture** | Flat | Flat | Hierarchical |
| **Gradient Sources** | Ladder only | Ladder + Probes | Ladder + Probes + History |
| **Cost Control** | Implicit | Single budget | Dual budget (inner/outer) |
| **LLM Calls** | Unclear | Unpredictable | Predictable (2-3) |
| **Policy Types** | Single | Multiple | ProbePolicy + Planner |
| **Convergence** | Budget only | Budget + Selector | isStable() + Budget |
| **Reproducibility** | No | Partial | Yes (deterministic inner loop) |
| **Status** | Concept | Superseded | **Current** |

---

## Citation Guidelines

### For Research Papers

**Citing current work:**
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

**Citing specific version:**
```bibtex
@techreport{liang2025aicl_v02,
  title={AICL v0.2: With Probe, BudgetTracker, and StrategySelector},
  author={Liang, Jay (Fienna)},
  year={2025},
  month={March},
  institution={CyberLoop Project},
  url={https://github.com/roackb2/cyberloop/blob/main/docs/whitepaper/versions/v0.2-with-probes.md}
}
```

**Citing core philosophy:**
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

### For Blog Posts / Articles

**Current version:**
> "According to the AICL whitepaper (Liang, 2025, v0.3), hierarchical control enables..."

**Specific version:**
> "The original AICL v0.2 design (Liang, 2025) proposed a flat architecture with..."

**Core philosophy:**
> "The AICL philosophy emphasizes five immutable pillars: gradient-guided exploration..."

---

## Version History Timeline

```
2025-01  v0.1  Original concept (4 modules, basic feedback loop)
   |
   ├─ Added: Probe, BudgetTracker, StrategySelector
   ├─ Reason: Needed gradient information and resource control
   ↓
2025-03  v0.2  With Probes (7 modules, flat architecture)
   |
   ├─ Added: Hierarchical layers, Planner, ControlBudget
   ├─ Changed: Policy → ProbePolicy (inner) + Planner (outer)
   ├─ Reason: Cost boundaries unclear, needed predictability
   ↓
2025-10  v0.3  Hierarchical (8 modules, inner/outer loops) ← CURRENT
```

---

## For Contributors

When working with different versions:

**Understanding evolution:**
1. Read [PHILOSOPHY.md](../PHILOSOPHY.md) - Understand what never changes
2. Read [EVOLUTION.md](../EVOLUTION.md) - Understand why things changed
3. Read current [AICL.md](../AICL.md) - Understand current implementation

**When extending:**
- Preserve the five core pillars (see PHILOSOPHY.md)
- Document why your changes align with core philosophy
- Update EVOLUTION.md if making architectural changes
- Create new version file if making breaking changes

**When debugging:**
- Check which version the code implements
- Verify assumptions match that version's design
- Don't mix concepts from different versions

---

## Questions?

- **"Which version should I cite?"** - Current (v0.3) unless comparing to older work
- **"Can I still use v0.2 concepts?"** - Yes, but v0.3 is recommended for new projects
- **"Will there be a v0.4?"** - Yes, as the framework evolves, but core philosophy stays constant
- **"How do I migrate from v0.2 to v0.3?"** - See [MIGRATION.md](../MIGRATION.md) (coming soon)

---

**Last Updated:** 2025-10-24  
**Maintained by:** CyberLoop Project  
**License:** Apache-2.0
