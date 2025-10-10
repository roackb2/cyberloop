/**
 * Turns an arbitrary scoring function into an evaluator compatible with the loop.
 */
export const DeltaScoreEvaluator = <S>(
  score: (prev: S, next: S) => number,
) => ({
  evaluate: (prev: S, next: S) => score(prev, next),
})
