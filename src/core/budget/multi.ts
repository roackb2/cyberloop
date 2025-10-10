import type { BudgetTracker } from '../interfaces'
import type { Cost } from '../types'

/** Tracks multiple resource caps (e.g., steps, tokens, latency) simultaneously. */
export class MultiBudget implements BudgetTracker {
  private readonly used: Record<string, number> = {}

  constructor(private readonly caps: Record<string, number>) { }

  record(cost: Cost): void {
    const entries: [string, number][] =
      typeof cost === 'number'
        ? [['steps', cost]]
        : Object.entries(cost)
    for (const [key, value] of entries) {
      if (value === undefined) continue
      this.used[key] = (this.used[key] ?? 0) + value
    }
  }

  remaining(): number {
    const ratios = Object.keys(this.caps).map(key => {
      const cap = this.caps[key]
      if (cap <= 0) return 0
      const used = this.used[key] ?? 0
      return (cap - used) / cap
    })
    if (!ratios.length) return Infinity
    return Math.max(0, Math.min(...ratios))
  }

  shouldStop(): boolean {
    return Object.keys(this.caps).some(key => {
      const cap = this.caps[key]
      return cap > 0 && (this.used[key] ?? 0) >= cap
    })
  }

  reset(valueMap?: Record<string, number>): void {
    for (const key of Object.keys(this.used)) {
      delete this.used[key]
    }
    if (valueMap) {
      for (const [key, value] of Object.entries(valueMap)) {
        this.used[key] = value
      }
    }
  }

  snapshot(): { used: Record<string, number>; caps: Record<string, number> } {
    return {
      caps: { ...this.caps },
      used: { ...this.used },
    }
  }
}
