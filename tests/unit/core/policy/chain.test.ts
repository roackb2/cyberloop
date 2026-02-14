/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Ladder, ProbePolicy } from '@/core/interfaces'
import type { PolicyGuard, PolicyReflex } from '@/core/policy/chain'
import { ChainPolicy } from '@/core/policy/chain'

// --- Test Helpers ---

const createMockLadder = (level = 0): Ladder<number> => ({
  level: () => level,
  update: () => { /* no-op */ },
})

const createMockInnerPolicy = (
  overrides: Partial<ProbePolicy<string, string, number>> = {}
): ProbePolicy<string, string, number> => ({
  id: 'mock-inner',
  decide: vi.fn(() => Promise.resolve('inner-action')),
  isStable: vi.fn(() => false),
  initialize: vi.fn(),
  adapt: vi.fn(),
  ...overrides,
})

const createMockGuard = (
  name: string,
  transform: (s: string) => string
): PolicyGuard<string> => ({
  name,
  apply: vi.fn((state: string) => transform(state)),
})

const createMockReflex = (
  name: string,
  action: string | null
): PolicyReflex<string, string> => ({
  name,
  check: vi.fn(() => Promise.resolve(action)),
})

// --- Tests ---

describe('ChainPolicy', () => {
  describe('Construction', () => {
    it('sets id based on inner policy', () => {
      const inner = createMockInnerPolicy({ id: 'my-policy' })
      const chain = new ChainPolicy(inner, [], [])

      expect(chain.id).toBe('chain(my-policy)')
    })
  })

  describe('initialize', () => {
    it('delegates to inner policy', () => {
      const inner = createMockInnerPolicy()
      const chain = new ChainPolicy(inner, [], [])

      chain.initialize('initial-state')

      expect(inner.initialize).toHaveBeenCalledWith('initial-state')
    })
  })

  describe('isStable', () => {
    it('delegates to inner policy returning false', () => {
      const inner = createMockInnerPolicy({ isStable: vi.fn(() => false) })
      const chain = new ChainPolicy(inner, [], [])

      expect(chain.isStable('state')).toBe(false)
      expect(inner.isStable).toHaveBeenCalledWith('state')
    })

    it('delegates to inner policy returning true', () => {
      const inner = createMockInnerPolicy({ isStable: vi.fn(() => true) })
      const chain = new ChainPolicy(inner, [], [])

      expect(chain.isStable('state')).toBe(true)
    })
  })

  describe('decide — reflexes', () => {
    it('returns reflex action when reflex triggers', async () => {
      const inner = createMockInnerPolicy()
      const reflex = createMockReflex('fast-reflex', 'reflex-action')
      const chain = new ChainPolicy(inner, [], [reflex])

      const action = await chain.decide('state', createMockLadder())

      expect(action).toBe('reflex-action')
      expect(inner.decide).not.toHaveBeenCalled()
    })

    it('skips reflex when it returns null', async () => {
      const inner = createMockInnerPolicy()
      const reflex = createMockReflex('no-op-reflex', null)
      const chain = new ChainPolicy(inner, [], [reflex])

      const action = await chain.decide('state', createMockLadder())

      expect(action).toBe('inner-action')
      expect(inner.decide).toHaveBeenCalled()
    })

    it('checks reflexes in order and stops at first trigger', async () => {
      const inner = createMockInnerPolicy()
      const reflex1 = createMockReflex('first', null)
      const reflex2 = createMockReflex('second', 'reflex-2-action')
      const reflex3 = createMockReflex('third', 'reflex-3-action')
      const chain = new ChainPolicy(inner, [], [reflex1, reflex2, reflex3])

      const action = await chain.decide('state', createMockLadder())

      expect(action).toBe('reflex-2-action')
      expect(reflex1.check).toHaveBeenCalled()
      expect(reflex2.check).toHaveBeenCalled()
      expect(reflex3.check).not.toHaveBeenCalled()
    })

    it('reflexes run before guards', async () => {
      const callOrder: string[] = []
      const inner = createMockInnerPolicy()
      const guard: PolicyGuard<string> = {
        name: 'tracking-guard',
        apply: vi.fn((s: string) => { callOrder.push('guard'); return s }),
      }
      const reflex: PolicyReflex<string, string> = {
        name: 'tracking-reflex',
        check: vi.fn(() => { callOrder.push('reflex'); return Promise.resolve('reflex-action' as string) }),
      }
      const chain = new ChainPolicy(inner, [guard], [reflex])

      await chain.decide('state', createMockLadder())

      expect(callOrder).toEqual(['reflex'])
      expect(guard.apply).not.toHaveBeenCalled()
    })
  })

  describe('decide — guards', () => {
    it('applies single guard to state before inner policy', async () => {
      const inner = createMockInnerPolicy()
      const guard = createMockGuard('upper', (s) => s.toUpperCase())
      const chain = new ChainPolicy(inner, [guard], [])

      await chain.decide('hello', createMockLadder())

      expect(guard.apply).toHaveBeenCalledWith('hello')
      expect(inner.decide).toHaveBeenCalledWith('HELLO', expect.anything())
    })

    it('applies guards in order (pipeline)', async () => {
      const inner = createMockInnerPolicy()
      const guard1 = createMockGuard('append-a', (s) => s + '-a')
      const guard2 = createMockGuard('append-b', (s) => s + '-b')
      const chain = new ChainPolicy(inner, [guard1, guard2], [])

      await chain.decide('start', createMockLadder())

      expect(inner.decide).toHaveBeenCalledWith('start-a-b', expect.anything())
    })

    it('passes ladder to inner policy', async () => {
      const inner = createMockInnerPolicy()
      const ladder = createMockLadder(2.5)
      const chain = new ChainPolicy(inner, [], [])

      await chain.decide('state', ladder)

      expect(inner.decide).toHaveBeenCalledWith('state', ladder)
    })
  })

  describe('decide — guards + reflexes combined', () => {
    it('when no reflex triggers, guards run then inner policy decides', async () => {
      const inner = createMockInnerPolicy()
      const reflex = createMockReflex('noop', null)
      const guard = createMockGuard('upper', (s) => s.toUpperCase())
      const chain = new ChainPolicy(inner, [guard], [reflex])

      const action = await chain.decide('hello', createMockLadder())

      expect(reflex.check).toHaveBeenCalled()
      expect(guard.apply).toHaveBeenCalledWith('hello')
      expect(action).toBe('inner-action')
    })
  })

  describe('adapt', () => {
    it('delegates to inner policy adapt', () => {
      const inner = createMockInnerPolicy()
      const chain = new ChainPolicy(inner, [], [])
      const ladder = createMockLadder()

      chain.adapt(0.5, ladder)

      expect(inner.adapt).toHaveBeenCalledWith(0.5, ladder)
    })

    it('handles inner policy without adapt gracefully', () => {
      const inner = createMockInnerPolicy({ adapt: undefined })
      const chain = new ChainPolicy(inner, [], [])

      expect(() => chain.adapt(0.5, createMockLadder())).not.toThrow()
    })
  })

  describe('no guards, no reflexes', () => {
    it('delegates directly to inner policy', async () => {
      const inner = createMockInnerPolicy()
      const chain = new ChainPolicy(inner, [], [])

      const action = await chain.decide('state', createMockLadder())

      expect(action).toBe('inner-action')
      expect(inner.decide).toHaveBeenCalledWith('state', expect.anything())
    })
  })
})
