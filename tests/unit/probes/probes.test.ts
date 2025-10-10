import { describe, expect, it } from 'vitest'

import { EntropyProbe, HitCountProbe } from '@/core/probes'

describe('Probes', () => {
  it('HitCountProbe fails when hits outside thresholds', async () => {
    const probe = HitCountProbe<{ hits: number }>(state => state.hits, { min: 1, max: 5 })
    expect(await probe.test({ hits: 0 })).toMatchObject({ pass: false })
    expect(await probe.test({ hits: 6 })).toMatchObject({ pass: false })
    expect(await probe.test({ hits: 3 })).toMatchObject({ pass: true })
  })

  it('EntropyProbe flags overly broad states', async () => {
    const probe = EntropyProbe<{ entropy: number }>(state => state.entropy, { max: 0.5, min: 0.1 })
    expect(await probe.test({ entropy: 0.6 })).toMatchObject({ pass: false })
    expect(await probe.test({ entropy: 0.05 })).toMatchObject({ reason: 'entropy-low' })
    expect(await probe.test({ entropy: 0.3 })).toMatchObject({ pass: true })
  })
})
