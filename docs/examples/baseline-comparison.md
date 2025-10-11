# Benchmark Results: Inner/Outer Loop vs Baseline

> **⚠️ Note on Benchmark Suitability**
> 
> This GitHub repository search benchmark primarily **validates that the framework works** (runnable, converges systematically, bounded exploration). However, it's **not the ideal scenario to demonstrate the framework's value** because:
> 
> **The search space is not truly unknown:**
> - LLMs are trained on public GitHub repositories and likely already know popular solutions
> - Tool calls are mainly for **verification**, not exploration
> - The agent isn't discovering new information, just confirming existing knowledge
> - No genuine exploration of unknown space
> 
> **The framework excels when:**
> - The search space is **private or post-training** (unknown to the LLM)
> - Systematic exploration is needed to **discover** rather than verify
> - The agent must navigate **truly unfamiliar territory**
> 
> **Better benchmark scenarios:**
> - **Private Knowledge Retrieval** (Notion/Confluence) - Unknown to LLM, requires real exploration
> - **Code Bug Localization** - Private codebases, multi-step investigation
> - **Multi-File Refactoring** - Project-specific patterns, dependency discovery
> 
> See [docs/use-cases.md](../use-cases.md) for detailed comparisons.

---

**Query**: "node graceful shutdown"  
**Date**: 2025-10-11  
**Architecture**: Inner/Outer Loop with Deterministic Policy + LLM Planner

---

## Results Summary

| Metric | Baseline (No Control Loop) | AICL (Inner/Outer Loop) | Winner |
|--------|---------------------------|------------------|---------|
| **Duration** | 14.82s | 37.53s | ⚠️ Baseline (2.5x faster) |
| **Search API Calls** | 2 | 5 | ⚠️ Baseline (2.5x fewer) |
| **LLM Calls** | 2 | 2 | ✓ Tie |
| **Total Cost** | ~4 units | ~4.5 units | ✓ Baseline (slightly cheaper) |
| **Repositories Found** | 3 high-quality | 10 high-quality | ✓ AICL (3.3x more) |
| **Output Quality** | Excellent | Excellent | ✓ Tie |
| **Exploration Pattern** | Direct | Adaptive (narrow→broaden→narrow) | ✓ AICL (systematic) |
| **Inner Loop Steps** | N/A | 5 | ✓ AICL (bounded exploration) |
| **Convergence** | Immediate | 4 iterations to stable state | ⚠️ Baseline (faster) |

---

## Detailed Analysis

### Baseline Agent (No Control Loop)

**Search API Calls:**
1. `{"keywords":["node","graceful","shutdown"],"language":"javascript","minStars":50}` → 7 hits
2. `{"keywords":["graceful","shutdown"],"orKeywords":["node","express"],"language":"javascript","minStars":50}` → Unknown hits

**Strategy:**
- Direct LLM-driven search with strategic filters
- Used minStars=50 to filter quality
- Added OR keywords for broader coverage
- **Efficient** - LLM made smart decisions upfront

**Repositories Found (3 total):**
1. godaddy/terminus (1,893 stars)
2. sebhildebrandt/http-graceful-shutdown (226 stars)
3. RisingStack/kubernetes-graceful-shutdown-example (169 stars)

**Output Quality:** ✅ Excellent
- Clear recommendations with usage examples
- Code snippets for each library
- Practical integration advice

---

### AICL (Inner/Outer Loop Architecture)

**Inner Loop Exploration (Deterministic Policy):**
```
t=0: 0 hits → broaden (remove keyword) → 106 hits
t=1: 106 hits (>30, too many) → narrow (minStars=50) → 7 hits  
t=2: 7 hits (<10, too few) → broaden (remove minStars) → 106 hits
t=3: 106 hits (>30, too many) → narrow (minStars=20) → 10 hits
t=4: 10 hits (in range 10-30) → STABLE ✓
```

**Strategy:**
- **Deterministic narrowing/broadening** based on hit count
- Used adaptive increments (50 → 20) to avoid overshooting
- Converged to stable state in 5 steps
- **Systematic exploration** of the search space

**Outer Loop Calls:**
1. **Planner.plan()** - Created initial search strategy
2. **Planner.evaluate()** - Summarized final results

**Repositories Found (10 total):**
1. godaddy/terminus (1,893 stars)
2. aws/aws-node-termination-handler (1,728 stars)
3. gajus/lightship (527 stars)
4. sebhildebrandt/http-graceful-shutdown (226 stars)
5. RisingStack/kubernetes-graceful-shutdown-example (169 stars)
6. the-moebius/http-graceful-shutdown (89 stars)
7. maksim-paskal/aks-node-termination-handler (52 stars)
8. simonecorsi/fine (32 stars)
9. nikitaeverywhere/node-graceful-shutdown (28 stars)
10. itteco/graceful-cluster (22 stars)

**Output Quality:** ✅ Excellent
- Comprehensive recommendations with code examples
- Usage guidance for each library
- Gaps analysis and next steps
- Practical integration advice

---

## Key Findings

### ✅ What Worked

1. **Systematic Convergence**
   - Deterministic policy successfully navigated the search space
   - Adaptive narrowing (50 → 20) prevented overshooting
   - Converged to stable state (10 hits) in just 5 steps

2. **Bounded Exploration**
   - Inner loop budget prevented infinite exploration
   - Outer loop budget limited LLM calls to 2
   - Clear separation of concerns (exploration vs planning)

3. **More Comprehensive Results**
   - Found 10 repos vs 3 (3.3x more)
   - Covered broader range of solutions
   - Better diversity in recommendations

4. **Transparent Decision Process**
   - Every step logged with reasoning
   - Clear exploration pattern visible
   - Reproducible and debuggable

### ⚠️ Trade-offs

1. **Slower Execution**
   - 37.53s vs 14.82s (2.5x slower)
   - More API calls needed for convergence
   - Deterministic exploration takes time

2. **More API Calls**
   - 5 search calls vs 2
   - But same number of LLM calls (2 each)
   - Cost difference minimal (~0.5 units)

3. **Complexity**
   - More moving parts (policy, planner, orchestrator)
   - Requires tuning thresholds (10-30 hits range)
   - Baseline is simpler

---

## Conclusion

**The Inner/Outer Loop architecture successfully demonstrated:**

✅ **Systematic exploration** - Deterministic policy navigated search space methodically  
✅ **Convergence** - Found stable state with adaptive narrowing/broadening  
✅ **Bounded cost** - Limited LLM calls to 2 (same as baseline)  
✅ **Better coverage** - 3.3x more repositories found  
✅ **Separation of concerns** - Fast exploration (inner) + strategic planning (outer)

**Trade-offs:**
- 2.5x slower due to more API calls
- More complex architecture
- Requires threshold tuning

**When to use Inner/Outer Loop:**
- When comprehensive exploration is needed
- When search space is large and unpredictable
- When you want bounded, reproducible exploration
- When LLM cost is a concern (limits calls to outer loop only)

**When to use Baseline:**
- When speed is critical
- When LLM is already good at the task
- When simple is better
- When search space is well-understood
