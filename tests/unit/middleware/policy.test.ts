/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Ladder, ProbePolicy } from '@/core/interfaces'
import { policyMiddleware } from '@/core/middleware/policy'
import type { StepContext, StepResult } from '@/core/middleware/types'
import type { PolicyGuard, PolicyReflex } from '@/core/policy/chain'

// --- Test Helpers ---

const createMockPolicy = (
  overrides: Partial<ProbePolicy<string, string, number>> = {},
): ProbePolicy<string, string, number> => ({
  id: 'mock-policy',
  decide: vi.fn((): Promise<string> => Promise.resolve('policy-action')),
  isStable: vi.fn((): boolean => false),
  initialize: vi.fn(),
  adapt: vi.fn(),
  ...overrides,
})

const createMockLadder = (): Ladder<number> => ({
  level: (): number => 0,
  update: vi.fn(),
})

const createMockGuard = (
  name: string,
  transform: (s: string) => string,
): PolicyGuard<string> => ({
  name,
  apply: vi.fn((state: string) => transform(state)),
})

const createMockReflex = (
  name: string,
  action: string | null,
): PolicyReflex<string, string> => ({
  name,
  check: vi.fn(() => Promise.resolve(action)),
})

const makeCtx = (step = 0, state = 'state'): StepContext<string> => ({
  step,
  state,
  budget: { used: step, remaining: 10 },
  metadata: {},
})

const makeResult = (state = 'next-state', action?: unknown, feedback?: unknown): StepResult<string> => ({
  state,
  action,
  feedback,
})

// --- Tests ---

describe('policyMiddleware', () => {
  describe('factory', () => {
    it('returns middleware and decideAction', () => {
      const { middleware, decideAction } = policyMiddleware({
        basePolicy: createMockPolicy(),
        ladder: createMockLadder(),
      })

      expect(middleware).toBeDefined()
      expect(middleware.name).toBe('policy(mock-policy)')
      expect(typeof decideAction).toBe('function')
    })
  })

  describe('decideAction', () => {
    it('delegates to chain policy and returns action', async () => {
      const policy = createMockPolicy()
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder: createMockLadder(),
      })

      const action = await decideAction('my-state')

      expect(action).toBe('policy-action')
      expect(policy.initialize).toHaveBeenCalledWith('my-state')
      expect(policy.decide).toHaveBeenCalled()
    })

    it('initializes chain policy only once', async () => {
      const policy = createMockPolicy()
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder: createMockLadder(),
      })

      await decideAction('state-1')
      await decideAction('state-2')

      expect(policy.initialize).toHaveBeenCalledTimes(1)
      expect(policy.decide).toHaveBeenCalledTimes(2)
    })

    it('applies guards before base policy', async () => {
      const policy = createMockPolicy()
      const guard = createMockGuard('upper', (s) => s.toUpperCase())
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        guards: [guard],
        ladder: createMockLadder(),
      })

      await decideAction('hello')

      expect(guard.apply).toHaveBeenCalledWith('hello')
      expect(policy.decide).toHaveBeenCalledWith('HELLO', expect.anything())
    })

    it('checks reflexes before guards and base policy', async () => {
      const policy = createMockPolicy()
      const guard = createMockGuard('upper', (s) => s.toUpperCase())
      const reflex = createMockReflex('intercept', 'reflex-action')
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        guards: [guard],
        reflexes: [reflex],
        ladder: createMockLadder(),
      })

      const action = await decideAction('state')

      expect(action).toBe('reflex-action')
      expect(reflex.check).toHaveBeenCalled()
      expect(guard.apply).not.toHaveBeenCalled()
      expect(policy.decide).not.toHaveBeenCalled()
    })

    it('falls through to base policy when reflex returns null', async () => {
      const policy = createMockPolicy()
      const reflex = createMockReflex('noop', null)
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        reflexes: [reflex],
        ladder: createMockLadder(),
      })

      const action = await decideAction('state')

      expect(action).toBe('policy-action')
      expect(reflex.check).toHaveBeenCalled()
      expect(policy.decide).toHaveBeenCalled()
    })
  })

  describe('middleware lifecycle', () => {
    it('setup resets initialization state', async () => {
      const policy = createMockPolicy()
      const { middleware, decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder: createMockLadder(),
      })

      // First run
      await decideAction('state-1')
      expect(policy.initialize).toHaveBeenCalledTimes(1)

      // Reset via setup
      await middleware.setup!({ input: 'new-input' })

      // Second run should re-initialize
      await decideAction('state-2')
      expect(policy.initialize).toHaveBeenCalledTimes(2)
    })

    it('afterStep stores last action in metadata', async () => {
      const { middleware, decideAction } = policyMiddleware({
        basePolicy: createMockPolicy(),
        ladder: createMockLadder(),
      })

      await decideAction('state')

      const ctx = makeCtx()
      const result = makeResult()
      await middleware.afterStep!(ctx, result)

      expect(ctx.metadata['policyAction']).toBe('policy-action')
    })

    it('afterStep feeds back to ladder and policy when feedback present', async () => {
      const policy = createMockPolicy()
      const ladder = createMockLadder()
      const { middleware, decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder,
      })

      await decideAction('state')

      const ctx = makeCtx()
      const result = makeResult('next', undefined, 0.5)
      await middleware.afterStep!(ctx, result)

      expect(ladder.update).toHaveBeenCalledWith(0.5)
      expect(policy.adapt).toHaveBeenCalledWith(0.5, ladder)
    })

    it('afterStep does not feed back when no feedback', async () => {
      const policy = createMockPolicy()
      const ladder = createMockLadder()
      const { middleware, decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder,
      })

      await decideAction('state')

      const ctx = makeCtx()
      const result = makeResult()
      await middleware.afterStep!(ctx, result)

      expect(ladder.update).not.toHaveBeenCalled()
      expect(policy.adapt).not.toHaveBeenCalledWith(expect.anything(), expect.anything())
    })
  })

  describe('empty guards and reflexes', () => {
    it('works with no guards or reflexes', async () => {
      const policy = createMockPolicy()
      const { decideAction } = policyMiddleware({
        basePolicy: policy,
        ladder: createMockLadder(),
      })

      const action = await decideAction('state')

      expect(action).toBe('policy-action')
    })
  })
})
