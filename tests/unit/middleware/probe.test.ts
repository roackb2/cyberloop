/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Probe } from '@/core/interfaces'
import { probeMiddleware } from '@/core/middleware/probe'
import type { StepContext } from '@/core/middleware/types'

const createCtx = (overrides: Partial<StepContext<string>> = {}): StepContext<string> => ({
  step: 0,
  state: 'test',
  budget: { used: 0, remaining: 10 },
  metadata: {},
  ...overrides,
})

describe('probeMiddleware', () => {
  it('has name based on probe id', () => {
    const probe: Probe<string> = { id: 'entropy', test: vi.fn() }
    const mw = probeMiddleware<string>(probe)
    expect(mw.name).toBe('probe:entropy')
  })

  it('runs probe and attaches result to metadata', async () => {
    const probe: Probe<string> = {
      id: 'hit-count',
      test: vi.fn(() => Promise.resolve({ pass: true, hits: 5 })),
    }
    const mw = probeMiddleware<string>(probe)

    const result = await mw.beforeStep!(createCtx({ state: 'my-state' }))

    expect(result).not.toBe('halt')
    const ctx = result as StepContext<string>
    expect(ctx.metadata['hit-count']).toEqual({ pass: true, hits: 5 })
    expect(probe.test).toHaveBeenCalledWith('my-state')
  })

  it('handles sync probe.test', async () => {
    const probe: Probe<string> = {
      id: 'sync-probe',
      test: vi.fn(() => ({ pass: false })),
    }
    const mw = probeMiddleware<string>(probe)

    const result = await mw.beforeStep!(createCtx())

    expect(result).not.toBe('halt')
    const ctx = result as StepContext<string>
    expect(ctx.metadata['sync-probe']).toEqual({ pass: false })
  })

  it('preserves existing metadata', async () => {
    const probe: Probe<string> = {
      id: 'new-probe',
      test: vi.fn(() => Promise.resolve({ pass: true })),
    }
    const mw = probeMiddleware<string>(probe)

    const result = await mw.beforeStep!(createCtx({ metadata: { existing: 'value' } }))

    const ctx = result as StepContext<string>
    expect(ctx.metadata['existing']).toBe('value')
    expect(ctx.metadata['new-probe']).toEqual({ pass: true })
  })
})
