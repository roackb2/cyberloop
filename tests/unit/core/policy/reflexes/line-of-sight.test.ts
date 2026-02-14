import { describe, expect, it, vi } from 'vitest'

// Mock the wikipedia telemetry logger before importing
vi.mock('@/adapters/wikipedia/telemetry', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}))

import type { WikiState } from '@/adapters/wikipedia/types'
import { LineOfSightReflex } from '@/core/policy/reflexes/line-of-sight'

const createState = (overrides: Partial<WikiState> = {}): WikiState => ({
  currentTitle: 'Current Page',
  summary: 'Some summary',
  url: 'https://en.wikipedia.org/wiki/Current_Page',
  goal: 'Target Page',
  history: [],
  depth: 0,
  links: [],
  ...overrides,
})

describe('LineOfSightReflex', () => {
  const reflex = new LineOfSightReflex()

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
    ;(state as { links?: string[] }).links = undefined

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
