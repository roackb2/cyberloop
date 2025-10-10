import type { Ladder, Policy } from '@/core/interfaces'

import type { GhAction, GhState } from './env'

export const QueryMutatePolicy: Policy<GhState, GhAction, number> = {
  id: 'query-mutate',
  capabilities: () => ({ explorationRange: [0, 3], cost: { step: 1 } }),
  decide: async (state: GhState, ladder: Ladder<number>) => {
    const level = ladder.level()
    if (state.hits === 0) return { type: 'broaden' }
    if (state.entropy > 0.8 && level < 1.5) return { type: 'narrow' }
    return { type: 'rephrase' }
  },
}
