import { describe, expect, it } from 'vitest'

import { createControlBudget, SimpleControlBudget } from '@/core/budget/control-budget'

describe('ControlBudget', () => {
  describe('SimpleControlBudget', () => {
    it('creates budget with inner and outer loop trackers', () => {
      const budget = createControlBudget(100, 50)
      
      expect(budget.innerLoop).toBeDefined()
      expect(budget.outerLoop).toBeDefined()
      expect(budget.innerLoop.remaining()).toBe(100)
      expect(budget.outerLoop.remaining()).toBe(50)
    })

    it('shouldStop returns false when both budgets have remaining', () => {
      const budget = createControlBudget(100, 50)
      
      expect(budget.shouldStop()).toBe(false)
    })

    it('shouldStop returns true when inner loop exhausted', () => {
      const budget = createControlBudget(10, 50)
      
      budget.innerLoop.record(15)
      
      expect(budget.innerLoop.shouldStop()).toBe(true)
      expect(budget.outerLoop.shouldStop()).toBe(false)
      expect(budget.shouldStop()).toBe(true)
    })

    it('shouldStop returns true when outer loop exhausted', () => {
      const budget = createControlBudget(100, 10)
      
      budget.outerLoop.record(15)
      
      expect(budget.innerLoop.shouldStop()).toBe(false)
      expect(budget.outerLoop.shouldStop()).toBe(true)
      expect(budget.shouldStop()).toBe(true)
    })

    it('shouldStop returns true when both loops exhausted', () => {
      const budget = createControlBudget(10, 10)
      
      budget.innerLoop.record(15)
      budget.outerLoop.record(15)
      
      expect(budget.innerLoop.shouldStop()).toBe(true)
      expect(budget.outerLoop.shouldStop()).toBe(true)
      expect(budget.shouldStop()).toBe(true)
    })
  })

  describe('Inner Loop Budget', () => {
    it('tracks cheap operations (probes, local adjustments)', () => {
      const budget = createControlBudget(100, 50)
      
      // Simulate cheap probe operations
      budget.innerLoop.record(0.05) // Probe 1
      budget.innerLoop.record(0.1)  // Probe 2
      budget.innerLoop.record(0.05) // Probe 3
      
      expect(budget.innerLoop.remaining()).toBeCloseTo(99.8, 2)
      expect(budget.shouldStop()).toBe(false)
    })

    it('exhausts after many cheap operations', () => {
      const budget = createControlBudget(1, 50)
      
      // Simulate 100 probe operations at 0.01 each
      for (let i = 0; i < 100; i++) {
        budget.innerLoop.record(0.01)
      }
      
      expect(budget.innerLoop.remaining()).toBeCloseTo(0, 10)
      expect(budget.shouldStop()).toBe(true)
    })

    it('can be reset to original value', () => {
      const budget = createControlBudget(100, 50)
      
      budget.innerLoop.record(80)
      expect(budget.innerLoop.remaining()).toBe(20)
      
      budget.innerLoop.reset?.()
      expect(budget.innerLoop.remaining()).toBe(100)
    })

    it('can be reset to new value', () => {
      const budget = createControlBudget(100, 50)
      
      budget.innerLoop.record(80)
      budget.innerLoop.reset?.(200)
      
      expect(budget.innerLoop.remaining()).toBe(200)
    })
  })

  describe('Outer Loop Budget', () => {
    it('tracks expensive operations (LLM calls, planning)', () => {
      const budget = createControlBudget(100, 50)
      
      // Simulate expensive LLM calls
      budget.outerLoop.record(10) // Plan generation
      budget.outerLoop.record(15) // Evaluation
      budget.outerLoop.record(12) // Replanning
      
      expect(budget.outerLoop.remaining()).toBe(13)
      expect(budget.shouldStop()).toBe(false)
    })

    it('exhausts faster than inner loop', () => {
      const budget = createControlBudget(100, 50)
      
      // Few expensive operations
      budget.outerLoop.record(20)
      budget.outerLoop.record(20)
      budget.outerLoop.record(15)
      
      expect(budget.outerLoop.shouldStop()).toBe(true)
      expect(budget.innerLoop.shouldStop()).toBe(false)
      expect(budget.shouldStop()).toBe(true)
    })

    it('can be reset independently', () => {
      const budget = createControlBudget(100, 50)
      
      budget.outerLoop.record(40)
      budget.innerLoop.record(80)
      
      budget.outerLoop.reset?.()
      
      expect(budget.outerLoop.remaining()).toBe(50)
      expect(budget.innerLoop.remaining()).toBe(20)
    })
  })

  describe('Hierarchical Control Pattern', () => {
    it('allows many inner loop iterations per outer loop iteration', () => {
      const budget = createControlBudget(100, 50)
      
      // Outer loop: expensive planning
      budget.outerLoop.record(10)
      
      // Inner loop: many cheap probes
      for (let i = 0; i < 20; i++) {
        budget.innerLoop.record(0.5)
      }
      
      expect(budget.innerLoop.remaining()).toBe(90)
      expect(budget.outerLoop.remaining()).toBe(40)
      expect(budget.shouldStop()).toBe(false)
    })

    it('stops when outer loop exhausted even if inner has budget', () => {
      const budget = createControlBudget(1000, 10)
      
      // Exhaust outer loop
      budget.outerLoop.record(12)
      
      expect(budget.innerLoop.remaining()).toBe(1000)
      expect(budget.outerLoop.remaining()).toBe(-2)
      expect(budget.shouldStop()).toBe(true)
    })

    it('stops when inner loop exhausted even if outer has budget', () => {
      const budget = createControlBudget(10, 1000)
      
      // Exhaust inner loop
      budget.innerLoop.record(12)
      
      expect(budget.innerLoop.remaining()).toBe(-2)
      expect(budget.outerLoop.remaining()).toBe(1000)
      expect(budget.shouldStop()).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('handles zero initial budgets', () => {
      const budget = createControlBudget(0, 0)
      
      expect(budget.shouldStop()).toBe(true)
    })

    it('handles negative costs (refunds)', () => {
      const budget = createControlBudget(100, 50)
      
      budget.innerLoop.record(50)
      budget.innerLoop.record(-10) // Refund
      
      expect(budget.innerLoop.remaining()).toBe(60)
    })

    it('handles very small costs', () => {
      const budget = createControlBudget(1, 1)
      
      budget.innerLoop.record(0.0001)
      budget.outerLoop.record(0.0001)
      
      expect(budget.innerLoop.remaining()).toBeCloseTo(0.9999, 4)
      expect(budget.outerLoop.remaining()).toBeCloseTo(0.9999, 4)
      expect(budget.shouldStop()).toBe(false)
    })

    it('handles very large costs', () => {
      const budget = createControlBudget(1000000, 1000000)
      
      budget.innerLoop.record(999999)
      budget.outerLoop.record(999999)
      
      expect(budget.innerLoop.remaining()).toBe(1)
      expect(budget.outerLoop.remaining()).toBe(1)
      expect(budget.shouldStop()).toBe(false)
    })

    it('handles exact budget exhaustion', () => {
      const budget = createControlBudget(100, 50)
      
      budget.innerLoop.record(100)
      budget.outerLoop.record(50)
      
      expect(budget.innerLoop.remaining()).toBe(0)
      expect(budget.outerLoop.remaining()).toBe(0)
      expect(budget.shouldStop()).toBe(true)
    })
  })

  describe('Direct Construction', () => {
    it('can be constructed directly with custom trackers', () => {
      const mockInner = {
        record: () => { /* no-op */ },
        remaining: () => 100,
        shouldStop: () => false,
        reset: () => { /* no-op */ },
      }
      
      const mockOuter = {
        record: () => { /* no-op */ },
        remaining: () => 50,
        shouldStop: () => false,
        reset: () => { /* no-op */ },
      }
      
      const budget = new SimpleControlBudget(mockInner, mockOuter)
      
      expect(budget.innerLoop).toBe(mockInner)
      expect(budget.outerLoop).toBe(mockOuter)
      expect(budget.shouldStop()).toBe(false)
    })

    it('respects custom tracker logic', () => {
      const mockInner = {
        record: () => { /* no-op */ },
        remaining: () => 0,
        shouldStop: () => true,
        reset: () => { /* no-op */ },
      }
      
      const mockOuter = {
        record: () => { /* no-op */ },
        remaining: () => 100,
        shouldStop: () => false,
        reset: () => { /* no-op */ },
      }
      
      const budget = new SimpleControlBudget(mockInner, mockOuter)
      
      expect(budget.shouldStop()).toBe(true)
    })
  })

  describe('Real-World Usage', () => {
    it('GitHub search scenario: many probes, few LLM calls', () => {
      const budget = createControlBudget(10, 100) // 10 for probes, 100 for LLM
      
      // Initial planning
      budget.outerLoop.record(20)
      
      // First iteration: run probes
      budget.innerLoop.record(0.05) // hasHitsProbe
      budget.innerLoop.record(0.1)  // entropyGuardProbe
      budget.innerLoop.record(0)    // dropGuardProbe (free)
      
      // Replanning
      budget.outerLoop.record(25)
      
      // Second iteration: more probes
      budget.innerLoop.record(0.05)
      budget.innerLoop.record(0.1)
      
      expect(budget.innerLoop.remaining()).toBeCloseTo(9.7, 2)
      expect(budget.outerLoop.remaining()).toBe(55)
      expect(budget.shouldStop()).toBe(false)
    })

    it('Dependency solver scenario: balanced budgets', () => {
      const budget = createControlBudget(50, 50)
      
      // Outer loop: analyze dependency graph
      budget.outerLoop.record(15)
      
      // Inner loop: try local resolutions
      for (let i = 0; i < 10; i++) {
        budget.innerLoop.record(2)
      }
      
      // Outer loop: global replanning
      budget.outerLoop.record(20)
      
      expect(budget.innerLoop.remaining()).toBe(30)
      expect(budget.outerLoop.remaining()).toBe(15)
      expect(budget.shouldStop()).toBe(false)
    })

    it('stops gracefully when budget runs out', () => {
      const budget = createControlBudget(5, 20)
      
      let iterations = 0
      while (!budget.shouldStop() && iterations < 100) {
        budget.innerLoop.record(1)
        iterations++
      }
      
      expect(iterations).toBe(5)
      expect(budget.shouldStop()).toBe(true)
    })
  })
})
