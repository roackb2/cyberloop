import { describe, expect, it, type vi } from 'vitest'

import { LineOfSightReflex } from '@/core/policy/reflexes/line-of-sight'

interface TestState {
  goal: string
  links: string[]
}

interface TestAction {
  type: string
  title: string
}

const createState = (overrides: Partial<TestState> = {}): TestState => ({
  goal: 'Target Page',
  links: [],
  ...overrides,
})

const createReflex = (logger?: { info: ReturnType<typeof vi.fn> }) =>
  new LineOfSightReflex<TestState, TestAction>({
    getLinks: (s) => s.links,
    getGoal: (s) => s.goal,
    createAction: (goal) => ({ type: 'NAVIGATE', title: goal }),
    logger: logger as never,
  })

describe('LineOfSightReflex', () => {
  const reflex = createReflex()

  it('has correct name', () => {
    expect(reflex.name).toBe('line-of-sight')
  })

  it('returns NAVIGATE action when goal is in links', async () => {
    const state = createState({
      goal: 'Microprocessors',
      links: ['CPU', 'Microprocessors', 'RAM'],
    })

    const action = await reflex.check(state)

    expect(action).toEqual({ type: 'NAVIGATE', title: 'Microprocessors' })
  })

  it('returns null when goal is not in links', async () => {
    const state = createState({
      goal: 'Microprocessors',
      links: ['CPU', 'RAM', 'GPU'],
    })

    const action = await reflex.check(state)

    expect(action).toBeNull()
  })

  it('returns null when links is empty', async () => {
    const state = createState({
      goal: 'Microprocessors',
      links: [],
    })

    const action = await reflex.check(state)

    expect(action).toBeNull()
  })

  it('returns null when links is undefined', async () => {
    const state = createState({
      goal: 'Microprocessors',
    })
      // Force links to undefined to test defensive check
      ; (state as { links?: string[] }).links = undefined as unknown as string[]

    const action = await reflex.check(state)

    expect(action).toBeNull()
  })

  it('is case-sensitive (exact match required)', async () => {
    const state = createState({
      goal: 'Microprocessors',
      links: ['microprocessors', 'MICROPROCESSORS'],
    })

    const action = await reflex.check(state)

    expect(action).toBeNull()
  })
})
