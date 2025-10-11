# Benchmark Protocol · Private Knowledge Retrieval

## Dataset
- Create synthetic workspace of ~1,500 docs
- Distributions:
  - 40% engineering, 25% product, 20% ops, 15% misc
  - 30% updated in last 12 months
  - 15% near-duplicates to test dedupe
- Tags & namespaces with realistic skew

## Queries (seed set)
- "onboarding engineer checklist"
- "production readiness review template"
- "architecture decision record examples"
- "incident postmortem template" (kept generic; not triage/RCA tooling)

## Baselines
- Keyword-only search
- Embedding-only search (single-shot top-K)

## Procedure
- For each query: run 3 trials (fixed seed), log JSON traces
- Record: steps, actions, hits, scores, redundancy, costs, time
- Report: mean ± stddev; paired comparison vs baseline
