# Budget Model & Metrics · Private Knowledge Retrieval

## Cost Model (units)
- probe.run: 0.05
- policy.decide (deterministic): 0.10
- env.apply (search API call): 1.00
- planner.plan / evaluate / replan (LLM): 2.00 each

## Default Budgets
- innerLoop.units: 20
- outerLoop.units: 6  (plan + evaluate + optional replan)

## Metrics
- Relevance@K (K=10): avg evaluator score of top-10
- Redundancy: duplicate ratio among top-20 (title/url/content-hash)
- Recency ratio: fraction updated within 12 months
- Convergence steps: inner loop iterations to stability
- Cost (units), Time (s), API calls, LLM calls
- Reproducibility: stddev across 3 runs (fixed seed)

## Pass/Fail Thresholds
- Relevance@10 ≥ baseline + 10%
- Redundancy ≤ 15%
- Converges ≤ 4 steps (avg)
- Cost ≤ 8 units; Time ≤ 25s
