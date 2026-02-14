/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import { MiddlewareRunner } from '@/core/middleware/runner'
import type { Middleware, StepContext, StepResult } from '@/core/middleware/types'

// --- Test Helpers ---

const createCtx = (overrides: Partial<StepContext<string>> = {}): StepContext<string> => ({
  step: 0,
  state: 'initial',
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

const createResult = (overrides: Partial<StepResult<string>> = {}): StepResult<string> => ({
  state: 'next',
  ...overrides,
})

// --- Tests ---

describe('MiddlewareRunner', () => {
  describe('Construction', () => {
    it('creates with empty middleware list', () => {
      const runner = new MiddlewareRunner<string>()
      expect(runner.size).toBe(0)
    })

    it('creates with initial middleware', () => {
      const mw: Middleware<string> = { name: 'test' }
      const runner = new MiddlewareRunner<string>([mw])
      expect(runner.size).toBe(1)
    })
  })

  describe('use', () => {
    it('adds middleware to the chain', () => {
      const runner = new MiddlewareRunner<string>()
      runner.use({ name: 'a' })
      runner.use({ name: 'b' })
      expect(runner.size).toBe(2)
    })
  })

  describe('runSetup', () => {
    it('calls setup on all middleware in order', async () => {
      const order: string[] = []
      const mw1: Middleware<string> = {
        name: 'first',
        setup: vi.fn(() => { order.push('first'); return Promise.resolve() }),
      }
      const mw2: Middleware<string> = {
        name: 'second',
        setup: vi.fn(() => { order.push('second'); return Promise.resolve() }),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      await runner.runSetup({ input: 'hello' })

      expect(order).toEqual(['first', 'second'])
      expect(mw1.setup).toHaveBeenCalledWith({ input: 'hello' })
      expect(mw2.setup).toHaveBeenCalledWith({ input: 'hello' })
    })

    it('skips middleware without setup hook', async () => {
      const mw1: Middleware<string> = { name: 'no-setup' }
      const mw2: Middleware<string> = {
        name: 'has-setup',
        setup: vi.fn(() => Promise.resolve()),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      await runner.runSetup({ input: 'hello' })

      expect(mw2.setup).toHaveBeenCalled()
    })

    it('handles empty middleware list', async () => {
      const runner = new MiddlewareRunner<string>()
      await expect(runner.runSetup({ input: 'hello' })).resolves.toBeUndefined()
    })
  })

  describe('runTeardown', () => {
    it('calls teardown on all middleware in order', async () => {
      const order: string[] = []
      const mw1: Middleware<string> = {
        name: 'first',
        teardown: vi.fn(() => { order.push('first'); return Promise.resolve() }),
      }
      const mw2: Middleware<string> = {
        name: 'second',
        teardown: vi.fn(() => { order.push('second'); return Promise.resolve() }),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      await runner.runTeardown({ reason: 'done' })

      expect(order).toEqual(['first', 'second'])
      expect(mw1.teardown).toHaveBeenCalledWith({ reason: 'done' })
    })

    it('skips middleware without teardown hook', async () => {
      const mw: Middleware<string> = { name: 'no-teardown' }
      const runner = new MiddlewareRunner<string>([mw])

      await expect(runner.runTeardown({ reason: 'done' })).resolves.toBeUndefined()
    })
  })

  describe('runBeforeStep', () => {
    it('runs beforeStep hooks in registration order', async () => {
      const order: string[] = []
      const mw1: Middleware<string> = {
        name: 'first',
        beforeStep: vi.fn((ctx: StepContext<string>) => { order.push('first'); return Promise.resolve(ctx) }),
      }
      const mw2: Middleware<string> = {
        name: 'second',
        beforeStep: vi.fn((ctx: StepContext<string>) => { order.push('second'); return Promise.resolve(ctx) }),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      await runner.runBeforeStep(createCtx())

      expect(order).toEqual(['first', 'second'])
    })

    it('passes modified context through the chain', async () => {
      const mw1: Middleware<string> = {
        name: 'modifier',
        beforeStep: vi.fn((ctx: StepContext<string>) => Promise.resolve({
          ...ctx,
          state: ctx.state + '-modified',
        })),
      }
      const mw2: Middleware<string> = {
        name: 'reader',
        beforeStep: vi.fn((ctx: StepContext<string>) => Promise.resolve(ctx)),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      const result = await runner.runBeforeStep(createCtx({ state: 'start' }))

      expect(result).not.toBe('halt')
      expect((result as StepContext<string>).state).toBe('start-modified')
      expect(mw2.beforeStep).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'start-modified' })
      )
    })

    it('returns halt when a middleware halts', async () => {
      const mw1: Middleware<string> = {
        name: 'halter',
        beforeStep: vi.fn(() => Promise.resolve('halt' as const)),
      }
      const mw2: Middleware<string> = {
        name: 'never-reached',
        beforeStep: vi.fn((ctx: StepContext<string>) => Promise.resolve(ctx)),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      const result = await runner.runBeforeStep(createCtx())

      expect(result).toBe('halt')
      expect(mw2.beforeStep).not.toHaveBeenCalled()
    })

    it('skips middleware without beforeStep hook', async () => {
      const mw1: Middleware<string> = { name: 'no-hook' }
      const mw2: Middleware<string> = {
        name: 'has-hook',
        beforeStep: vi.fn((ctx: StepContext<string>) => Promise.resolve({ ...ctx, state: 'touched' as string })),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      const result = await runner.runBeforeStep(createCtx())

      expect(result).not.toBe('halt')
      expect((result as StepContext<string>).state).toBe('touched')
    })

    it('returns original context when no middleware has beforeStep', async () => {
      const runner = new MiddlewareRunner<string>([{ name: 'empty' }])
      const ctx = createCtx({ state: 'unchanged' })

      const result = await runner.runBeforeStep(ctx)

      expect(result).not.toBe('halt')
      expect((result as StepContext<string>).state).toBe('unchanged')
    })

    it('handles empty middleware list', async () => {
      const runner = new MiddlewareRunner<string>()
      const ctx = createCtx()

      const result = await runner.runBeforeStep(ctx)

      expect(result).toEqual(ctx)
    })
  })

  describe('runAfterStep', () => {
    it('runs afterStep hooks in reverse registration order (onion)', async () => {
      const order: string[] = []
      const mw1: Middleware<string> = {
        name: 'first',
        afterStep: vi.fn(() => { order.push('first'); return Promise.resolve() }),
      }
      const mw2: Middleware<string> = {
        name: 'second',
        afterStep: vi.fn(() => { order.push('second'); return Promise.resolve() }),
      }
      const mw3: Middleware<string> = {
        name: 'third',
        afterStep: vi.fn(() => { order.push('third'); return Promise.resolve() }),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2, mw3])

      await runner.runAfterStep(createCtx(), createResult())

      expect(order).toEqual(['third', 'second', 'first'])
    })

    it('passes context and result to each hook', async () => {
      const mw: Middleware<string> = {
        name: 'inspector',
        afterStep: vi.fn(() => Promise.resolve()),
      }
      const runner = new MiddlewareRunner<string>([mw])
      const ctx = createCtx({ step: 5 })
      const result = createResult({ cost: 0.1 })

      await runner.runAfterStep(ctx, result)

      expect(mw.afterStep).toHaveBeenCalledWith(ctx, result)
    })

    it('skips middleware without afterStep hook', async () => {
      const order: string[] = []
      const mw1: Middleware<string> = { name: 'no-hook' }
      const mw2: Middleware<string> = {
        name: 'has-hook',
        afterStep: vi.fn(() => { order.push('has-hook'); return Promise.resolve() }),
      }
      const runner = new MiddlewareRunner<string>([mw1, mw2])

      await runner.runAfterStep(createCtx(), createResult())

      expect(order).toEqual(['has-hook'])
    })

    it('handles empty middleware list', async () => {
      const runner = new MiddlewareRunner<string>()
      await expect(runner.runAfterStep(createCtx(), createResult())).resolves.toBeUndefined()
    })
  })

  describe('Full lifecycle', () => {
    it('runs setup → beforeStep → afterStep → teardown in correct order', async () => {
      const order: string[] = []
      const mw: Middleware<string> = {
        name: 'lifecycle',
        setup: vi.fn(() => { order.push('setup'); return Promise.resolve() }),
        beforeStep: vi.fn((ctx: StepContext<string>) => { order.push('before'); return Promise.resolve(ctx) }),
        afterStep: vi.fn(() => { order.push('after'); return Promise.resolve() }),
        teardown: vi.fn(() => { order.push('teardown'); return Promise.resolve() }),
      }
      const runner = new MiddlewareRunner<string>([mw])

      await runner.runSetup({ input: 'test' })
      await runner.runBeforeStep(createCtx())
      await runner.runAfterStep(createCtx(), createResult())
      await runner.runTeardown({ reason: 'complete' })

      expect(order).toEqual(['setup', 'before', 'after', 'teardown'])
    })

    it('metadata can be shared between beforeStep and afterStep', async () => {
      const captured: Record<string, unknown> = {}
      const mw: Middleware<string> = {
        name: 'metadata-writer',
        beforeStep: vi.fn((ctx: StepContext<string>) => {
          ctx.metadata['probeResult'] = 0.95
          return Promise.resolve(ctx)
        }),
        afterStep: vi.fn((ctx: StepContext<string>) => {
          Object.assign(captured, ctx.metadata)
          return Promise.resolve()
        }),
      }
      const runner = new MiddlewareRunner<string>([mw])
      const ctx = createCtx()

      const beforeResult = await runner.runBeforeStep(ctx)
      expect(beforeResult).not.toBe('halt')
      await runner.runAfterStep(beforeResult as StepContext<string>, createResult())

      expect(captured['probeResult']).toBe(0.95)
    })
  })
})
