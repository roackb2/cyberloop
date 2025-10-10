export const HitGainEvaluator = {
  evaluate: (prev: { hits: number }, next: { hits: number }) => next.hits - prev.hits,
}
