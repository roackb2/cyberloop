# Benchmark Results: AICL vs Baseline

**Query**: "node graceful shutdown"  
**Date**: 2025-10-10  
**Tool**: Multi-dimensional GitHub search (keywords, language, min_stars, topic, in_name, in_description)

---

## Results Summary

| Metric | Baseline (No Control Loop) | AICL (CyberLoop) | Winner |
|--------|---------------------------|------------------|---------|
| **Duration** | 20.11s | 55.00s | ⚠️ Baseline (2.7x faster) |
| **Tool Calls** | 3 | 6 | ⚠️ Baseline (2x fewer) |
| **Cost** | 6 units | 12.3 units | ⚠️ Baseline (2x cheaper) |
| **Repositories Found** | 5 high-quality | 8 high-quality | ✓ AICL (more comprehensive) |
| **Output Quality** | Excellent | Excellent | ✓ Tie |
| **Exploration Pattern** | Strategic | Oscillating | ⚠️ Baseline |

---

## Detailed Analysis

### Baseline Agent (No Control Loop)

**Tool Calls:**
1. `{"keywords":["node","graceful","shutdown"],"language":"javascript","minStars":20,"inDescription":true}`
2. `{"keywords":["graceful-shutdown"],"language":"javascript","minStars":20,"inName":true}`
3. `{"keywords":["shutdown"],"language":"javascript","minStars":20,"topic":"graceful-shutdown"}`

**Strategy:**
- Started with broad multi-keyword search with description filter
- Tried name-only search with hyphenated keyword
- Explored topic-based search
- **Efficient and strategic** - each search had a clear purpose

**Repositories Found:**
1. godaddy/terminus (1,893 stars)
2. sebhildebrandt/http-graceful-shutdown (226 stars)
3. RisingStack/kubernetes-graceful-shutdown-example (169 stars)
4. itteco/graceful-cluster (22 stars)
5. nikitaeverywhere/node-graceful-shutdown (28 stars)

**Output Quality:** ✅ Excellent
- Clear recommendations
- Usage examples with code
- Summary table
- Tailored advice

---

### AICL (CyberLoop)

**Loop Behavior:**
```
t=0: narrow → 0 hits (probe failed) → score: -0.20
t=1: broaden → 87 hits (probe passed) → score: +0.20, ladder: 0.10
t=2: narrow → 0 hits (probe failed) → score: -0.20, ladder: 0.02
t=3: broaden → 87 hits (probe passed) → score: +0.20, ladder: 0.12
t=4: narrow → 0 hits (probe failed) → score: -0.20, ladder: 0.04
t=5: broaden → 87 hits (probe passed) → score: +0.20, ladder: 0.14
```

**Problem Identified:** 🔴 **Oscillating behavior**
- Agent alternates between narrow (0 hits) and broaden (87 hits)
- Same query repeated 3 times (87 hits each time)
- Probes detect failures but agent doesn't learn
- Ladder climbs slowly but doesn't prevent oscillation

**Repositories Found:**
1. godaddy/terminus
2. gajus/lightship
3. sebhildebrandt/http-graceful-shutdown
4. RisingStack/kubernetes-graceful-shutdown-example
5. the-moebius/http-graceful-shutdown
6. simonecorsi/fine
7. nikitaeverywhere/node-graceful-shutdown
8. itteco/graceful-cluster

**Output Quality:** ✅ Excellent
- Comprehensive recommendations
- Code examples
- Gap analysis
- Clear guidance

---

## Key Findings

### ❌ AICL Did NOT Demonstrate Value

**Problems:**

1. **Oscillating Exploration**
   - Agent keeps switching between narrow/broaden
   - Repeats same successful query 3 times
   - Wastes budget on redundant searches

2. **Slower**
   - 55s vs 20s (2.7x slower)
   - More tool calls but less efficient

3. **More Expensive**
   - 12.3 units vs 6 units (2x cost)
   - Probes add overhead without preventing waste

4. **Agent Ignores Signals**
   - Probe history shows clear pattern (narrow fails, broaden succeeds)
   - Agent still tries narrow again
   - Mode parameter doesn't enforce behavior

### ✅ What AICL Did Provide

1. **Bounded Exploration**
   - Budget tracking worked (stopped at 7.70 remaining)
   - Prevented infinite loops

2. **Probe Signals**
   - Correctly detected no-hits failures
   - Probe history accumulated
   - Strategy switching triggered

3. **More Comprehensive Results**
   - Found 8 repos vs 5
   - Slightly more thorough coverage

4. **Reproducible Structure**
   - Clear loop iterations
   - Visible probe results
   - Transparent decision process

---

## Root Cause Analysis

### Why AICL Underperformed

1. **LLM Non-Determinism**
   - Agent doesn't reliably follow mode instructions
   - "broaden" mode still produces narrow queries sometimes
   - "narrow" mode produces queries that get 0 hits

2. **No Memory Between Iterations**
   - Agent sees probe history but doesn't learn from it
   - Repeats same successful query 3 times
   - No mechanism to prevent redundant searches

3. **Mode Selection Too Coarse**
   - Binary narrow/broaden doesn't capture nuance
   - Agent needs more specific guidance on WHICH dimensions to adjust
   - Current approach: "broaden" → agent decides how → inconsistent results

4. **Baseline is Actually Smart**
   - LLM is good at strategic exploration
   - Tries different filter combinations intelligently
   - No need for external control when LLM works well

---

## Honest Conclusion

**For this query, the baseline agent significantly outperformed AICL:**

- ⚠️ **2.7x faster**
- ⚠️ **2x cheaper**
- ⚠️ **More strategic exploration**
- ⚠️ **No oscillation**

**AICL added:**
- ✓ Budget tracking (useful for cost control)
- ✓ Probe-based failure detection (worked correctly)
- ✓ Slightly more comprehensive results
- ✗ But at 2x the cost and 2.7x the time

---

## When Might AICL Add Value?

Based on this benchmark, AICL would need:

1. **Deterministic Policy**
   - Not LLM-based
   - Directly adjusts specific filter dimensions
   - Example: "If no hits, remove one keyword" (not "ask LLM to broaden")

2. **State Tracking**
   - Remember which queries were tried
   - Prevent redundant searches
   - Learn from probe history

3. **Finer-Grained Control**
   - Specific dimension adjustments (add/remove keyword, adjust min_stars)
   - Not abstract "narrow/broaden" modes
   - Direct mapping from probe signals to actions

4. **Scenarios Where Baseline Fails**
   - Queries requiring systematic exploration
   - Hard budget constraints
   - Need for reproducibility
   - Agent gets stuck in loops (baseline didn't)

---

## Recommendations

### For This Framework

1. **Implement deterministic policy** (as designed in `structured-search-design.md`)
2. **Add query deduplication** to prevent redundant searches
3. **Make mode enforcement stricter** or remove LLM decision-making for dimensions
4. **Consider hybrid approach**: LLM suggests values, framework controls structure

### For Users

1. **Use baseline for most queries** - It's faster, cheaper, and works well
2. **Use AICL when you need**:
   - Hard budget limits
   - Reproducible exploration
   - Audit trail of decisions
3. **Don't use AICL for**:
   - One-off searches
   - Interactive exploration
   - When speed matters

---

## Appendix: Raw Data

### Baseline Tool Calls
```json
[
  {"keywords":["node","graceful","shutdown"],"language":"javascript","minStars":20,"inDescription":true},
  {"keywords":["graceful-shutdown"],"language":"javascript","minStars":20,"inName":true},
  {"keywords":["shutdown"],"language":"javascript","minStars":20,"topic":"graceful-shutdown"}
]
```

### AICL Loop Summary
```
t=0: hits=0, action=narrow, score=-0.20, ladder=0.00, budget=17.95
t=1: hits=87, action=broaden, score=+0.20, ladder=0.10, budget=15.90
t=2: hits=0, action=narrow, score=-0.20, ladder=0.02, budget=13.85
t=3: hits=87, action=broaden, score=+0.20, ladder=0.12, budget=11.80
t=4: hits=0, action=narrow, score=-0.20, ladder=0.04, budget=9.75
t=5: hits=87, action=broaden, score=+0.20, ladder=0.14, budget=7.70
```

### Probe History
```
[
  {id: 'gh-hit-count', pass: false, reason: 'no-hits', data: {count: 0, min: 1}},
  {id: 'gh-hit-count', pass: true, reason: 'passed', data: {count: 87, min: 1}},
  {id: 'gh-hit-count', pass: false, reason: 'no-hits', data: {count: 0, min: 1}},
  {id: 'gh-hit-count', pass: true, reason: 'passed', data: {count: 87, min: 1}},
  {id: 'gh-hit-count', pass: false, reason: 'no-hits', data: {count: 0, min: 1}}
]
```

---

**This is an honest assessment. AICL did not demonstrate clear value for this use case.**
