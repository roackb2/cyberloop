/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { Middleware, StepContext } from '@/core/middleware/types'
import type { Trajectory, TrajectoryFrame } from '@/core/trajectory'
import { isTrajectory } from '@/core/trajectory'
import { cyberloop } from '@/core/wrapper'

// --- Test Helpers ---

interface CounterState {
  value: number
  done: boolean
}

/**
 * A simple Trajectory that counts up to maxFrames.
 * This is NOT an agent — it has no run() method.
 */
const createTrajectory = (maxFrames = 3): Trajectory<CounterState> => ({
  getInitialState: vi.fn((_input: unknown) =>
    Promise.resolve({ value: 0, done: false }),
  ),
  advance: vi.fn((state: CounterState) =>
    Promise.resolve({
      state: { value: state.value + 1, done: state.value + 1 >= maxFrames },
      action: 'increment',
      cost: 1,
    } as TrajectoryFrame<CounterState>),
  ),
  isTerminal: vi.fn((state: CounterState) => state.done),
  toOutput: vi.fn((state: CounterState) => ({ output: `done at ${state.value}`, frames: state.value })),
})

// --- Tests ---

describe('isTrajectory', () => {
  it('returns true for a Trajectory object', () => {
    const traj = createTrajectory()
    expect(isTrajectory(traj)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isTrajectory(null)).toBe(false)
  })

  it('returns false for a plain object', () => {
    expect(isTrajectory({ foo: 'bar' })).toBe(false)
  })

  it('returns false for a partial implementation', () => {
    expect(isTrajectory({ getInitialState: vi.fn(), advance: vi.fn() })).toBe(false)
  })
})

describe('cyberloop with Trajectory', () => {
  it('drives the trajectory loop until isTerminal', async () => {
    const traj = createTrajectory(3)
    const wrapped = cyberloop<CounterState>(traj, { budget: { maxSteps: 50 } })

    const result = await wrapped.run('go' as never)

    expect(result.output).toBe('done at 3')
    expect(traj.advance).toHaveBeenCalledTimes(3)
    expect(traj.toOutput).toHaveBeenCalled()
  })

  it('runs middleware around each advance() call', async () => {
    const steps: number[] = []
    const mw: Middleware<CounterState> = {
      name: 'frame-tracker',
      beforeStep: vi.fn((ctx: StepContext<CounterState>) => {
        steps.push(ctx.step)
        return Promise.resolve(ctx)
      }),
    }
    const traj = createTrajectory(2)
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [mw],
    })

    await wrapped.run('go' as never)

    expect(steps).toEqual([0, 1])
  })

  it('runs setup and teardown lifecycle', async () => {
    const order: string[] = []
    const mw: Middleware<CounterState> = {
      name: 'lifecycle',
      setup: vi.fn(() => { order.push('setup'); return Promise.resolve() }),
      teardown: vi.fn(() => { order.push('teardown'); return Promise.resolve() }),
      beforeStep: vi.fn((ctx: StepContext<CounterState>) => {
        order.push(`before-${ctx.step}`)
        return Promise.resolve(ctx)
      }),
      afterStep: vi.fn((_ctx, _result) => {
        order.push('after')
        return Promise.resolve()
      }),
    }
    const traj = createTrajectory(2)
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [mw],
    })

    await wrapped.run('go' as never)

    expect(order).toEqual(['setup', 'before-0', 'after', 'before-1', 'after', 'teardown'])
  })

  it('halts when budget is exhausted', async () => {
    const traj = createTrajectory(100) // would run 100 frames
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 3 },
    })

    const result = await wrapped.run('go' as never)

    expect(traj.advance).toHaveBeenCalledTimes(3)
    expect(result).toBeDefined()
  })

  it('calls onHalt when budget halts the loop', async () => {
    const onHalt = vi.fn()
    const traj = createTrajectory(100)
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 2 },
      on: { onHalt },
    })

    await wrapped.run('go' as never)

    expect(onHalt).toHaveBeenCalledWith('budget')
  })

  it('passes prevState to middleware after first frame', async () => {
    const prevStates: (CounterState | undefined)[] = []
    const mw: Middleware<CounterState> = {
      name: 'prev-tracker',
      beforeStep: vi.fn((ctx: StepContext<CounterState>) => {
        prevStates.push(ctx.prevState)
        return Promise.resolve(ctx)
      }),
    }
    const traj = createTrajectory(2)
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [mw],
    })

    await wrapped.run('go' as never)

    expect(prevStates[0]).toBeUndefined() // first frame has no prev
    expect(prevStates[1]).toEqual({ value: 0, done: false }) // second frame has prev
  })

  it('passes non-string input to setup and getInitialState', async () => {
    const setupInputs: unknown[] = []
    const mw: Middleware<CounterState> = {
      name: 'input-tracker',
      setup: vi.fn((ctx: { input: unknown }) => { setupInputs.push(ctx.input); return Promise.resolve() }),
    }
    const traj = createTrajectory(1)
    const corpusInput = { documents: ['doc1', 'doc2'], config: { k: 5 } }
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [mw],
    })

    await wrapped.run(corpusInput as never)

    // setup receives the raw input object, not a stringified version
    expect(setupInputs[0]).toEqual(corpusInput)
    expect(traj.getInitialState).toHaveBeenCalledWith(corpusInput)
  })

  it('middleware can modify state before advance()', async () => {
    const mw: Middleware<CounterState> = {
      name: 'state-modifier',
      beforeStep: vi.fn((ctx: StepContext<CounterState>) => {
        // Double the value before each advance
        return Promise.resolve({
          ...ctx,
          state: { ...ctx.state, value: ctx.state.value * 2 },
        })
      }),
    }
    const traj = createTrajectory(100)
    // Override advance to check it receives modified state
    const advancedStates: number[] = []
    traj.advance = vi.fn((state: CounterState) => {
      advancedStates.push(state.value)
      return Promise.resolve({
        state: { value: state.value + 1, done: state.value + 1 >= 3 },
      })
    })

    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [mw],
    })

    await wrapped.run('go' as never)

    // Step 0: state.value=0, doubled to 0, advance gets 0, produces 1
    // Step 1: state.value=1, doubled to 2, advance gets 2, produces 3 (terminal)
    expect(advancedStates).toEqual([0, 2])
  })

  it('metadata channels are available to middleware', async () => {
    const capturedMetadata: Record<string, unknown>[] = []
    const writer: Middleware<CounterState> = {
      name: 'writer',
      beforeStep: vi.fn((ctx: StepContext<CounterState>) => {
        return Promise.resolve({
          ...ctx,
          metadata: { ...ctx.metadata, kinematics: { position: [1, 2, 3] } },
        })
      }),
    }
    const reader: Middleware<CounterState> = {
      name: 'reader',
      afterStep: vi.fn((ctx: StepContext<CounterState>) => {
        capturedMetadata.push({ ...ctx.metadata })
        return Promise.resolve()
      }),
    }
    const traj = createTrajectory(1)
    const wrapped = cyberloop<CounterState>(traj, {
      budget: { maxSteps: 50 },
      middleware: [writer, reader],
    })

    await wrapped.run('go' as never)

    expect(capturedMetadata[0]).toEqual(
      expect.objectContaining({ kinematics: { position: [1, 2, 3] } }),
    )
  })
})
