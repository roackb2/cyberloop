# Authoring Guide · Planner & ProbePolicy (Private Docs)

## Planner (LLM, outer loop)
Responsibilities:
- Parse user query → extract entities, tags, namespaces
- Propose initial filters and cluster focus
- Summarize final curated set; explain trade-offs
- Replan if stuck: switch to alternative clusters or rephrase

Prompt template (sketch):
- System: "You are an information architect for private knowledge bases."
- User: "{query}"
- Assistant (goals): "Propose filters: tags, namespaces, recency; list 2–3 clusters; give rephrase option."

## ProbePolicy (deterministic, inner loop)
Decision table (example):
| Condition                              | Action                                   |
|----------------------------------------|-------------------------------------------|
| hits > 100                             | narrow by recency (12m)                   |
| 20 < hits ≤ 100                        | narrow by tags from planner               |
| 8 ≤ hits ≤ 20                          | isStable = true                           |
| 3 ≤ hits < 8                           | diversify by namespace; expand synonyms   |
| hits < 3                               | broaden (remove filters) or rephrase      |
| redundancy > 0.3                       | dedupe then diversify                     |
| entropy < 0.3                          | diversify by namespace                    |
| entropy > 0.6                          | narrow by tags                            |

Implementation tips:
- Keep `decide()` ≤ 50ms, pure & testable
- Log reason codes for each action
- Avoid LLM in inner loop
