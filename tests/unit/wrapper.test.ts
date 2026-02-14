/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { AgentLike, AgentResult, StepOutput, SteppableAgent } from '@/core/agent-protocol'
import { isSteppable } from '@/core/agent-protocol'
import type { Middleware, StepContext } from '@/core/middleware/types'
import { cyberloop } from '@/core/wrapper'

// --- Test Helpers ---

interface TestResult extends AgentResult {
  steps?: number
}

const createOpaqueAgent = (output = 'done'): AgentLike<string, TestResult> => ({
  run: vi.fn(() => Promise.resolve({ output })),
})

interface TestState {
  value: number
  done: boolean
}

const createSteppableAgent = (maxSteps = 3): SteppableAgent<TestState, string, TestResult> => ({
  run: vi.fn(() => Promise.resolve({ output: 'fallback' })),
  getInitialState: vi.fn(() => Promise.resolve({ value: 0, done: false })),
  step: vi.fn((state: TestState) =>
    Promise.resolve({
      state: { value: state.value + 1, done: state.value + 1 >= maxSteps },
      action: 'increment',
      cost: 1,
    } as StepOutput<TestState>),
  ),
  isDone: vi.fn((state: TestState) => state.done),
  toResult: vi.fn((state: TestState) => ({ output: `done at ${state.value}`, steps: state.value })),
})

// --- Tests ---

describe('isSteppable', () => {
  it('returns true for steppable agents', () => {
    const agent = createSteppableAgent()
    expect(isSteppable(agent)).toBe(true)
  })

  it('returns false for opaque agents', () => {
    const agent = createOpaqueAgent()
    expect(isSteppable(agent)).toBe(false)
  })
})

describe('cyberloop', () => {
  describe('Opaque agent', () => {
    it('delegates to agent.run()', async () => {
      const agent = createOpaqueAgent('hello')
      const wrapped = cyberloop(agent)

      const result = await wrapped.run('input')

      expect(result.output).toBe('hello')
      expect(agent.run).toHaveBeenCalledWith('input')
    })

    it('runs middleware setup and teardown', async () => {
      const order: string[] = []
      const mw: Middleware<unknown> = {
        name: 'tracker',
        setup: vi.fn(() => { order.push('setup'); return Promise.resolve() }),
        teardown: vi.fn(() => { order.push('teardown'); return Promise.resolve() }),
      }
      const agent = createOpaqueAgent()
      const wrapped = cyberloop(agent, { middleware: [mw] })

      await wrapped.run('input')

      expect(order).toEqual(['setup', 'teardown'])
    })

    it('runs beforeStep and afterStep around run()', async () => {
      const order: string[] = []
      const mw: Middleware<unknown> = {
        name: 'tracker',
        beforeStep: vi.fn((ctx: StepContext<unknown>) => {
          order.push('before')
          return Promise.resolve(ctx)
        }),
        afterStep: vi.fn(() => {
          order.push('after')
          return Promise.resolve()
        }),
      }
      const agent = createOpaqueAgent()
      const wrapped = cyberloop(agent, { middleware: [mw] })

      await wrapped.run('input')

      expect(order).toEqual(['before', 'after'])
    })

    it('returns empty output when halted before execution', async () => {
      const haltMw: Middleware<unknown> = {
        name: 'halter',
        beforeStep: vi.fn(() => Promise.resolve('halt' as const)),
      }
      const onHalt = vi.fn()
      const agent = createOpaqueAgent()
      const wrapped = cyberloop(agent, {
        middleware: [haltMw],
        on: { onHalt },
      })

      const result = await wrapped.run('input')

      expect(result.output).toBe('')
      expect(agent.run).not.toHaveBeenCalled()
      expect(onHalt).toHaveBeenCalledWith('budget')
    })
  })

  describe('Steppable agent', () => {
    it('runs step loop until isDone', async () => {
      const agent = createSteppableAgent(3)
      const wrapped = cyberloop<TestState>(agent, { budget: { maxSteps: 50 } })

      const result = await wrapped.run('go')

      expect(result.output).toBe('done at 3')
      expect(agent.step).toHaveBeenCalledTimes(3)
      expect(agent.toResult).toHaveBeenCalled()
    })

    it('runs middleware around each step', async () => {
      const steps: number[] = []
      const mw: Middleware<TestState> = {
        name: 'step-tracker',
        beforeStep: vi.fn((ctx: StepContext<TestState>) => {
          steps.push(ctx.step)
          return Promise.resolve(ctx)
        }),
      }
      const agent = createSteppableAgent(2)
      const wrapped = cyberloop<TestState>(agent, {
        budget: { maxSteps: 50 },
        middleware: [mw],
      })

      await wrapped.run('go')

      expect(steps).toEqual([0, 1])
    })

    it('halts when budget middleware stops', async () => {
      const agent = createSteppableAgent(100) // would run 100 steps
      const wrapped = cyberloop<TestState>(agent, {
        budget: { maxSteps: 3 },
      })

      const result = await wrapped.run('go')

      // Budget of 3 steps: step 0,1,2 execute, then budget exhausted at step 3
      expect(agent.step).toHaveBeenCalledTimes(3)
      expect(result).toBeDefined()
    })

    it('calls onHalt when budget halts the loop', async () => {
      const onHalt = vi.fn()
      const agent = createSteppableAgent(100)
      const wrapped = cyberloop<TestState>(agent, {
        budget: { maxSteps: 2 },
        on: { onHalt },
      })

      await wrapped.run('go')

      expect(onHalt).toHaveBeenCalledWith('budget')
    })

    it('passes prevState to middleware after first step', async () => {
      const prevStates: (TestState | undefined)[] = []
      const mw: Middleware<TestState> = {
        name: 'prev-tracker',
        beforeStep: vi.fn((ctx: StepContext<TestState>) => {
          prevStates.push(ctx.prevState)
          return Promise.resolve(ctx)
        }),
      }
      const agent = createSteppableAgent(2)
      const wrapped = cyberloop<TestState>(agent, {
        budget: { maxSteps: 50 },
        middleware: [mw],
      })

      await wrapped.run('go')

      expect(prevStates[0]).toBeUndefined() // first step has no prev
      expect(prevStates[1]).toEqual({ value: 0, done: false }) // second step has prev
    })
  })

  describe('Event hooks', () => {
    it('calls beforeStep and afterStep hooks', async () => {
      const beforeSteps: number[] = []
      const afterSteps: number[] = []
      const agent = createSteppableAgent(2)
      const wrapped = cyberloop<TestState>(agent, {
        budget: { maxSteps: 50 },
        on: {
          beforeStep: (ctx) => { beforeSteps.push(ctx.step) },
          afterStep: (ctx) => { afterSteps.push(ctx.step) },
        },
      })

      await wrapped.run('go')

      expect(beforeSteps).toEqual([0, 1])
      expect(afterSteps).toEqual([0, 1])
    })
  })

  describe('Telemetry', () => {
    it('logs when logger is provided', async () => {
      const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
      }
      const agent = createOpaqueAgent()
      const wrapped = cyberloop(agent, { logger })

      await wrapped.run('input')

      // Telemetry middleware should have logged setup and teardown
      expect(logger.info).toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalled()
    })
  })

  describe('Default budget', () => {
    it('defaults to 50 max steps', async () => {
      // Create an agent that never finishes
      const neverDone: SteppableAgent<TestState, string, TestResult> = {
        run: vi.fn(() => Promise.resolve({ output: 'fallback' })),
        getInitialState: vi.fn(() => Promise.resolve({ value: 0, done: false })),
        step: vi.fn((state: TestState) =>
          Promise.resolve({ state: { value: state.value + 1, done: false }, cost: 1 }),
        ),
        isDone: vi.fn(() => false),
        toResult: vi.fn((state: TestState) => ({ output: `stopped at ${state.value}` })),
      }
      const wrapped = cyberloop<TestState>(neverDone)

      const result = await wrapped.run('go')

      // Default budget is 50 steps
      expect(neverDone.step).toHaveBeenCalledTimes(50)
      expect(result.output).toBe('stopped at 50')
    })
  })
})
