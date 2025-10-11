# Windsurf Brief · Sprint PDR-01 (Private Document Retrieval)

## Scope

Implement the Private Knowledge Retrieval adapter using AICL Adaptive Mode (ProbePolicy + Planner).

## Read First

- /docs/use-cases/private-doc-retrieval/brief.md
- /docs/specs/private-doc-retrieval/schema.md
- /docs/specs/private-doc-retrieval/sequence.md
- /docs/specs/private-doc-retrieval/budget-metrics.md
- /docs/guides/authoring-planner-probepolicy.md

## Do

- Implement adapter env with a mock repo (in-memory / JSON files)
- Implement deterministic ProbePolicy per decision table
- Implement Planner stubs calling LLM only for plan/evaluate/replan
- Emit structured logs per step (state, action, feedback, ladder, budget)

## Do Not

- Modify core interfaces without ADR
- Introduce LLM calls in inner loop
- Persist embeddings for the full corpus upfront

## Definition of Done

- `npm run examples:pdr` produces a JSON report with metrics
- Converges ≤ 4 steps on average for seed queries
- Meets thresholds in /docs/specs/private-doc-retrieval/budget-metrics.md
