# Control Flow & Sequence · Private Knowledge Retrieval

## ASCII Sequence (Adaptive Mode)
```
User → Planner.plan(query) → S0
        ↓ notes (clusters, entities)
┌ Inner Loop (ProbePolicy) ┐
│ repeat until stable or inner budget exhausted
│   Probes.run(S) → signals (hits, entropy, recency ratio)
│   decide(S) → PkAction (narrow | broaden | rephrase | diversify | dedupe)
│   Environment.apply(action) → S'
│   Evaluator.evaluate(S,S') → feedback
│   Ladder.update(feedback); Budget.inner--
│   if isStable(S') break
└────────────────────────────┘
if stable:
  Planner.evaluate(S_final, history) → summary + curated set
else if Budget.outer has:
  Planner.replan(S_last, history) → S0' ; reset inner budget → loop
else:
  STOP with best-known set + explanation
```

## Stability Criteria
- hits in [8,20]
- redundancy ≤ 15%
- mean relevance ≥ 0.75
- entropy ∈ [0.3, 0.6]

## Failure & Recovery
- If `hits < 3` for two consecutive steps → force broaden
- If `hits > 100` → auto narrow by recency (updatedAfter = now-12m)
- If duplicate ratio > 0.3 → dedupe + diversify
