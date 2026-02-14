import { describe, expect, it } from 'vitest'

import { stagnationMiddleware } from '@/core/middleware/stagnation'
import type { StepContext, StepResult } from '@/core/middleware/types'

const createCtx = (overrides: Partial<StepContext<string>> = {}): StepContext<string> => ({
  step: 0,
  state: 'test',
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

const createResult = (): StepResult<string> => ({ state: 'next' })

describe('stagnationMiddleware', () => {
  it('has correct name', () => {
    const mw = stagnationMiddleware<string>()
    expect(mw.name).toBe('stagnation')
  })

  it('does not halt before stagnation threshold', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 3 })
    await mw.setup!({ input: 'test' })

    // 2 stagnant steps (no feedback)
    const ctx1 = createCtx({ metadata: {} })
    await mw.afterStep!(ctx1, createResult())
    const ctx2 = createCtx({ metadata: {} })
    await mw.afterStep!(ctx2, createResult())

    const result = await mw.beforeStep!(createCtx())
    expect(result).not.toBe('halt')
  })

  it('halts after maxStagnantSteps with no improvement', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 3 })
    await mw.setup!({ input: 'test' })

    // 3 stagnant steps
    for (let i = 0; i < 3; i++) {
      const ctx = createCtx({ metadata: {} })
      await mw.afterStep!(ctx, createResult())
    }

    const result = await mw.beforeStep!(createCtx())
    expect(result).toBe('halt')
  })

  it('resets counter on positive feedback', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 3 })
    await mw.setup!({ input: 'test' })

    // 2 stagnant steps
    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: {} })
      await mw.afterStep!(ctx, createResult())
    }

    // Positive feedback resets counter
    const goodCtx = createCtx({ metadata: { feedback: 0.5 } })
    await mw.afterStep!(goodCtx, createResult())

    // 2 more stagnant steps (still under threshold of 3)
    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: {} })
      await mw.afterStep!(ctx, createResult())
    }

    const result = await mw.beforeStep!(createCtx())
    expect(result).not.toBe('halt')
  })

  it('treats zero feedback as stagnation by default', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 2 })
    await mw.setup!({ input: 'test' })

    // Zero feedback counts as stagnation (not > 0)
    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: { feedback: 0 } })
      await mw.afterStep!(ctx, createResult())
    }

    const result = await mw.beforeStep!(createCtx())
    expect(result).toBe('halt')
  })

  it('respects custom minImprovement', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 2, minImprovement: 0.1 })
    await mw.setup!({ input: 'test' })

    // Feedback of 0.05 is below minImprovement of 0.1 → counts as stagnation
    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: { feedback: 0.05 } })
      await mw.afterStep!(ctx, createResult())
    }

    const result = await mw.beforeStep!(createCtx())
    expect(result).toBe('halt')
  })

  it('uses default maxStagnantSteps of 5', async () => {
    const mw = stagnationMiddleware<string>()
    await mw.setup!({ input: 'test' })

    // 4 stagnant steps — should not halt yet
    for (let i = 0; i < 4; i++) {
      const ctx = createCtx({ metadata: {} })
      await mw.afterStep!(ctx, createResult())
    }
    expect(await mw.beforeStep!(createCtx())).not.toBe('halt')

    // 5th stagnant step
    const ctx5 = createCtx({ metadata: {} })
    await mw.afterStep!(ctx5, createResult())
    expect(await mw.beforeStep!(createCtx())).toBe('halt')
  })

  it('setup resets stagnation counter', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 2 })
    await mw.setup!({ input: 'test' })

    // Reach stagnation
    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: {} })
      await mw.afterStep!(ctx, createResult())
    }
    expect(await mw.beforeStep!(createCtx())).toBe('halt')

    // Reset via setup
    await mw.setup!({ input: 'test' })
    expect(await mw.beforeStep!(createCtx())).not.toBe('halt')
  })

  it('treats negative feedback as stagnation', async () => {
    const mw = stagnationMiddleware<string>({ maxStagnantSteps: 2 })
    await mw.setup!({ input: 'test' })

    for (let i = 0; i < 2; i++) {
      const ctx = createCtx({ metadata: { feedback: -0.5 } })
      await mw.afterStep!(ctx, createResult())
    }

    expect(await mw.beforeStep!(createCtx())).toBe('halt')
  })
})
