import { describe, expect, it, vi } from 'vitest'

import type { Logger } from '@/core/interfaces'
import { telemetryMiddleware } from '@/core/middleware/telemetry'
import type { StepContext, StepResult } from '@/core/middleware/types'

const createLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
})

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

describe('telemetryMiddleware', () => {
  it('has correct name', () => {
    const mw = telemetryMiddleware<string>(createLogger())
    expect(mw.name).toBe('telemetry')
  })

  describe('setup', () => {
    it('logs loop start', async () => {
      const logger = createLogger()
      const mw = telemetryMiddleware<string>(logger)

      await mw.setup!({ input: 'my query' })

      expect(logger.info).toHaveBeenCalledWith(
        { input: 'my query' },
        'Loop started',
      )
    })
  })

  describe('beforeStep', () => {
    it('logs step start with step number and budget', async () => {
      const logger = createLogger()
      const mw = telemetryMiddleware<string>(logger)
      const ctx = createCtx({ step: 3, budget: { used: 3, remaining: 7 } })

      const result = await mw.beforeStep!(ctx)

      expect(result).not.toBe('halt')
      expect(logger.debug).toHaveBeenCalledWith(
        { step: 3, budget: { used: 3, remaining: 7 } },
        'Step 3 starting',
      )
    })

    it('returns context unchanged', async () => {
      const logger = createLogger()
      const mw = telemetryMiddleware<string>(logger)
      const ctx = createCtx({ state: 'my-state' })

      const result = await mw.beforeStep!(ctx)

      expect(result).not.toBe('halt')
      expect((result as StepContext<string>).state).toBe('my-state')
    })
  })

  describe('afterStep', () => {
    it('logs step completion with action and cost', async () => {
      const logger = createLogger()
      const mw = telemetryMiddleware<string>(logger)
      const ctx = createCtx({ step: 2, metadata: { feedback: 0.8 } })
      const result = createResult({ action: 'NAVIGATE', cost: 1.5 })

      await mw.afterStep!(ctx, result)

      expect(logger.debug).toHaveBeenCalledWith(
        { step: 2, action: 'NAVIGATE', cost: 1.5, feedback: 0.8 },
        'Step 2 completed',
      )
    })
  })

  describe('teardown', () => {
    it('logs loop end with reason', async () => {
      const logger = createLogger()
      const mw = telemetryMiddleware<string>(logger)

      await mw.teardown!({ reason: 'budget exhausted' })

      expect(logger.info).toHaveBeenCalledWith(
        { reason: 'budget exhausted' },
        'Loop ended',
      )
    })
  })
})
