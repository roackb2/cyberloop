import type { Probe } from '@/core/interfaces'
import { EntropyProbe, HitCountProbe } from '@/core/probes'

import type { GhState } from './env'

const stateInspector = function (this: void, state: GhState): {
  query: string
  hits: number
  entropy: number
  items: string[] | undefined
  history: { filters: string; hits: number }[] | undefined
} {
  const { query, hits, entropy, items, history } = state
  const itemSummary = items?.map(i => i.title)
  const historySummary = history?.map(h => {
    const filters = Object.entries(h.filters).map(([key, value]) => `${key}: ${value}`).join(', ')
    return {
      filters,
      hits: h.hits,
    }
  })
  const inspection = {
    query,
    hits,
    entropy,
    items: itemSummary,
    history: historySummary,
  }
  return inspection
}

export const hasHitsProbe = HitCountProbe<GhState>(state => state.hits, {
  id: 'gh-hit-count',
  min: 1,
  cost: 0.05,
}, stateInspector)

// Drop guard probe that checks if hits dropped significantly from history
export const dropGuardProbe: Probe<GhState> = {
  id: 'gh-hit-drop',
  capabilities: () => ({ cost: 0, supports: ['NoData', 'TooNarrow'] }),
  test: (state) => {
    const current = state.hits
    const history = state.history ?? []

    // If no history, just check if we have any hits
    if (history.length === 0) {
      return current > 0
        ? { pass: true }
        : { pass: false, reason: 'no-hits-initial', data: { current, previous: null } }
    }

    // Check last hit count (history includes current query, so look at second-to-last)
    const previous = history.length >= 2
      ? history[history.length - 2]?.hits ?? 0
      : history[history.length - 1]?.hits ?? 0

    // If we had hits before but now have 0, that's a drop
    if (previous > 0 && current === 0) {
      return {
        pass: false,
        reason: 'hit-drop-to-zero',
        data: { current, previous, dropPercent: 100 }
      }
    }

    // If we had many hits and dropped by >80%, that's concerning
    if (previous > 10 && current < previous * 0.2) {
      const dropPercent = Math.round((1 - current / previous) * 100)
      return {
        pass: false,
        reason: 'significant-hit-drop',
        data: { current, previous, dropPercent }
      }
    }

    // If hits are consistently 0, signal to broaden
    const recentHits = history.slice(-3).map(h => h.hits)
    if (recentHits.every(h => h === 0) && current === 0) {
      return {
        pass: false,
        reason: 'stuck-at-zero',
        data: { current, previous, recentHits }
      }
    }

    return { pass: true, data: { current, previous } }
  },

  inspectState: stateInspector,
}

export const entropyGuardProbe = EntropyProbe<GhState>(state => state.entropy, {
  max: 0.85,
  min: 0.15,
  cost: 0.1,
})
