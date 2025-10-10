import type { Ladder } from '../interfaces'

/**
 * Proportional controller that scales ladder level by feedback signal.
 * Positive feedback raises the level, negative lowers it.
 */
export class ProportionalLadder implements Ladder<number> {
  private levelValue = 0

  constructor(
    private readonly opts: { gainUp?: number; gainDown?: number; max?: number } = {},
  ) { }

  update(feedback: number): void {
    const up = this.opts.gainUp ?? 0.5
    const down = this.opts.gainDown ?? 0.5
    const max = this.opts.max ?? 3

    if (feedback >= 0) {
      this.levelValue = Math.min(max, this.levelValue + up * feedback)
    } else {
      this.levelValue = Math.max(0, this.levelValue + down * feedback)
    }
  }

  level(): number {
    return this.levelValue
  }
}
