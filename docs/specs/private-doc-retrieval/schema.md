# Schema · Private Knowledge Retrieval

## State (PkState)
```ts
type Doc = {
  id: string
  title: string
  url: string
  snippet: string
  tags?: string[]
  updatedAt?: string // ISO8601
  score?: number     // evaluator relevance in [0,1]
  source?: "notion" | "confluence" | "wiki"
}
type PkState = {
  query: string
  filters: {
    tags?: string[]
    namespace?: string[]
    updatedAfter?: string // ISO8601
  }
  hits: number
  items: Doc[]
  entropy: number        // 0..1 diversity measure
  coverage: number       // 0..1 topic coverage proxy
  step: number
  notes?: string         // planner hints
}
```

## Action (PkAction)
Union of deterministic search moves (inner loop):
```ts
type PkAction =
  | { type: "broaden"; removeFilter?: ("tags"|"namespace"|"updatedAfter")[]; expandSynonyms?: boolean }
  | { type: "narrow"; addFilter?: { tags?: string[]; namespace?: string[]; updatedAfter?: string }; minUpdatedAfterMonths?: number }
  | { type: "rephrase"; newQuery: string }
  | { type: "dedupe"; strategy: "title" | "url" | "content-hash" }
  | { type: "diversify"; by: "namespace" | "tag" }
```

## Feedback (PkFeedback)
```ts
type PkFeedback = {
  deltaRelevance: number   // mean score change
  deltaEntropy: number     // diversity change
  stability: number        // 0..1 (closer to target window)
  comments?: string
}
```

## Evaluator Targets
- Stability window for hits: 8–20
- Redundancy ≤ 15%
- Mean relevance ≥ 0.75
- Recency bias: updatedAt within 12 months preferred
