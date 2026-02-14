/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { BudgetTracker } from '@/core/interfaces'
import { budgetMiddleware } from '@/core/middleware/budget'
import type { StepContext, StepResult } from '@/core/middleware/types'

const createCtx = (overrides: Partial<StepContext<string>> = {}): StepContext<string> => ({
  step: 0,
  state: 'test',
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

const createResult = (overrides: Partial<StepResult<string>> = {}): StepResult<string> => ({
  state: 'next',
  ...overrides,
})

const createTracker = (opts: { remaining?: number; shouldStop?: boolean } = {}): BudgetTracker => ({
  record: vi.fn(),
  remaining: vi.fn(() => opts.remaining ?? 10),
  shouldStop: vi.fn(() => opts.shouldStop ?? false),
})

describe('budgetMiddleware', () => {
  it('has correct name', () => {
    const mw = budgetMiddleware<string>(createTracker())
    expect(mw.name).toBe('budget')
  })

  describe('beforeStep', () => {
    it('returns halt when budget is exhausted', async () => {
      const tracker = createTracker({ shouldStop: true })
      const mw = budgetMiddleware<string>(tracker)

      const result = await mw.beforeStep!(createCtx())

      expect(result).toBe('halt')
    })

    it('returns context with budget snapshot when budget remains', async () => {
      const tracker = createTracker({ remaining: 7 })
      const mw = budgetMiddleware<string>(tracker)

      const result = await mw.beforeStep!(createCtx({ step: 3 }))

      expect(result).not.toBe('halt')
      const ctx = result as StepContext<string>
      expect(ctx.budget).toEqual({ used: 3, remaining: 7 })
    })

    it('checks shouldStop before each step', async () => {
      const tracker = createTracker()
      const mw = budgetMiddleware<string>(tracker)

      await mw.beforeStep!(createCtx())

      expect(tracker.shouldStop).toHaveBeenCalled()
    })
  })

  describe('afterStep', () => {
    it('records cost from result', async () => {
      const tracker = createTracker()
      const mw = budgetMiddleware<string>(tracker)

      await mw.afterStep!(createCtx(), createResult({ cost: 2.5 }))

      expect(tracker.record).toHaveBeenCalledWith(2.5)
    })

    it('defaults cost to 1 when not specified', async () => {
      const tracker = createTracker()
      const mw = budgetMiddleware<string>(tracker)

      await mw.afterStep!(createCtx(), createResult())

      expect(tracker.record).toHaveBeenCalledWith(1)
    })

    it('records zero cost when explicitly set', async () => {
      const tracker = createTracker()
      const mw = budgetMiddleware<string>(tracker)

      await mw.afterStep!(createCtx(), createResult({ cost: 0 }))

      expect(tracker.record).toHaveBeenCalledWith(0)
    })
  })
})
