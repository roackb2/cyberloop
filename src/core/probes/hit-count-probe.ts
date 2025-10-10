import type { Probe } from '../interfaces'

export interface HitCountProbeOpts {
  id?: string
  min?: number
  max?: number
  cost?: number
}

/**
 * Rejects states whose hit count is zero or outside desired bounds.
 * Useful as a cheap guard before executing wider exploration policies.
 */
export const HitCountProbe = <S>(
  getCount: (state: S) => number,
  opts: HitCountProbeOpts = {},
): Probe<S> => {
  const min = opts.min ?? 1
  const max = opts.max ?? Infinity
  const cost = opts.cost ?? 0.1
  return {
    id: opts.id ?? 'hit-count',
    capabilities: () => ({
      cost,
      supports: ['Unknown', 'NoData', 'TooBroad', 'TooNarrow'],
    }),
    test: (state) => {
      const count = getCount(state)
      if (!Number.isFinite(count)) {
        return { pass: false, reason: 'hit-count-invalid', data: { count } }
      }
      if (count < min) {
        return { pass: false, reason: 'no-hits', data: { count, min } }
      }
      if (count > max) {
        return { pass: false, reason: 'too-many-hits', data: { count, max } }
      }
      return { pass: true, data: { count, min, max } }
    },
  }
}
