import type { Probe } from '../interfaces'

export interface EntropyProbeOpts {
  id?: string
  max?: number
  min?: number
  cost?: number
}

/**
 * Rejects states whose entropy suggests over-broad or over-narrow exploration.
 */
export const EntropyProbe = <S>(
  getEntropy: (state: S) => number,
  opts: EntropyProbeOpts = {},
  inspector?: (state: S) => Record<string, unknown>,
): Probe<S> => {
  const max = opts.max ?? 0.85
  const min = opts.min ?? 0
  const cost = opts.cost ?? 0.2
  return {
    id: opts.id ?? 'entropy',
    capabilities: () => ({
      cost,
      supports: ['TooBroad', 'TooNarrow', 'Unknown'],
    }),
    test: (state) => {
      const entropy = getEntropy(state)
      if (!Number.isFinite(entropy)) {
        return { pass: false, reason: 'entropy-invalid' }
      }
      if (entropy > max) {
        return { pass: false, reason: 'entropy-high' }
      }
      if (entropy < min) {
        return { pass: false, reason: 'entropy-low' }
      }
      return { pass: true }
    },
    inspectState: inspector,
  }
}
