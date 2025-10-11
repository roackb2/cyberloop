# Use-Case Brief · Private Knowledge Retrieval

## Goal
Retrieve the most relevant, up-to-date internal documents related to a user query from a private workspace (Notion/Confluence/Wiki), using the AICL Inner/Outer Loop.

## Inputs
- User query (free text), e.g., "How do we onboard a new engineer?"
- Workspace API credentials (scoped read-only)
- Optional filters: namespace/team, recency window, tags

## Outputs
- Curated document set (top-K)
- Consolidated summary (LLM-generated)
- Evidence bundle: per-doc relevance scores, reasons, timestamps
- Trace log: loop steps, probes, ladder levels, budget usage

## Non-goals
- No modification of workspace documents
- No full-corpus embedding upfront (incremental only)
- No reliance on public web search

## Constraints
- Max Outer Loop calls: 3 (plan, evaluate, optional replan)
- Inner Loop budget: 20 units
- Privacy: data stays within adapter boundary; logs redact PII

## Definition of Done
- Converges ≤ 4 inner iterations on average
- Relevance@K ≥ baseline +10%
- Redundancy ≤ 15%
- Total cost ≤ 8 units; run time ≤ 25s
