/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Evaluator } from '@/core/interfaces'
import { evaluatorMiddleware } from '@/core/middleware/evaluator'
import type { StepContext, StepResult } from '@/core/middleware/types'

const createCtx = (overrides: Partial<StepContext<string>> = {}): StepContext<string> => ({
  step: 0,
  state: 'current',
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

const createResult = (overrides: Partial<StepResult<string>> = {}): StepResult<string> => ({
  state: 'next',
  ...overrides,
})

describe('evaluatorMiddleware', () => {
  it('has correct name', () => {
    const evaluator: Evaluator<string> = { evaluate: vi.fn() }
    const mw = evaluatorMiddleware<string>(evaluator)
    expect(mw.name).toBe('evaluator')
  })

  it('computes feedback and attaches to metadata', async () => {
    const evaluator: Evaluator<string> = {
      evaluate: vi.fn(() => Promise.resolve(0.75)),
    }
    const mw = evaluatorMiddleware<string>(evaluator)
    const ctx = createCtx({ prevState: 'prev' })

    await mw.afterStep!(ctx, createResult({ state: 'next' }))

    expect(evaluator.evaluate).toHaveBeenCalledWith('prev', 'next')
    expect(ctx.metadata['feedback']).toBe(0.75)
  })

  it('skips evaluation when prevState is undefined (first step)', async () => {
    const evaluator: Evaluator<string> = {
      evaluate: vi.fn(() => Promise.resolve(0.5)),
    }
    const mw = evaluatorMiddleware<string>(evaluator)
    const ctx = createCtx()

    await mw.afterStep!(ctx, createResult())

    expect(evaluator.evaluate).not.toHaveBeenCalled()
    expect(ctx.metadata['feedback']).toBeUndefined()
  })

  it('works with sync evaluator', async () => {
    const evaluator: Evaluator<string> = {
      evaluate: vi.fn(() => -0.3),
    }
    const mw = evaluatorMiddleware<string>(evaluator)
    const ctx = createCtx({ prevState: 'prev' })

    await mw.afterStep!(ctx, createResult())

    expect(ctx.metadata['feedback']).toBe(-0.3)
  })
})
