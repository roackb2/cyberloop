import type { Evaluator } from '@/core/interfaces'

import type { GhState } from './env'

export class AgentRelevanceEvaluator implements Evaluator<GhState, number> {
  async evaluate(prev: GhState, next: GhState): Promise<number> {
    const deltaHits = next.hits - prev.hits
    const entropyImprovement = prev.entropy - next.entropy
    const normalizedDelta = deltaHits / Math.max(1, prev.hits + next.hits)
    return normalizedDelta * 0.6 + entropyImprovement * 0.4
  }
}
