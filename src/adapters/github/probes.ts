import { EntropyProbe, HitCountProbe } from '@/core/probes'

import type { GhState } from './env'

export const hasHitsProbe = HitCountProbe<GhState>(state => state.hits, {
  id: 'gh-hit-count',
  min: 1,
  cost: 0.05,
})

export const entropyGuardProbe = EntropyProbe<GhState>(state => state.entropy, {
  id: 'gh-entropy',
  max: 0.85,
  min: 0.15,
  cost: 0.1,
})
