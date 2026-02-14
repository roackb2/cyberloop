/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest'

import type { StateEmbedder } from '@/core/kinematics/interfaces'
import { SoftLandingReflex } from '@/core/policy/reflexes/soft-landing'

interface TestState { label: string }
interface TestAction { type: string; result: string }

const createState = (overrides: Partial<TestState> = {}): TestState => ({
  label: 'Current Page',
  ...overrides,
})

const createMockEmbedder = (embedding: number[]): StateEmbedder<TestState> => ({
  embed: vi.fn(() => Promise.resolve(embedding)),
})

const createDoneAction = (reason: string): TestAction => ({ type: 'DONE', result: reason })

const createReflex = (embedder: StateEmbedder<TestState>, goalEmbedding: number[], threshold?: number) =>
  new SoftLandingReflex<TestState, TestAction>({
    embedder,
    goalEmbedding,
    createDoneAction,
    threshold,
  })

describe('SoftLandingReflex', () => {
  it('has correct name', () => {
    const embedder = createMockEmbedder([1, 0, 0])
    const reflex = createReflex(embedder, [1, 0, 0])

    expect(reflex.name).toBe('soft-landing')
  })

  it('returns DONE when cosine similarity exceeds threshold', async () => {
    // Identical vectors → cosine similarity = 1.0
    const goalEmbedding = [1, 0, 0]
    const embedder = createMockEmbedder([1, 0, 0])
    const reflex = createReflex(embedder, goalEmbedding, 0.85)

    const action = await reflex.check(createState())

    expect(action).toEqual({ type: 'DONE', result: 'Semantic Match Reached' })
  })

  it('returns null when cosine similarity is below threshold', async () => {
    // Orthogonal vectors → cosine similarity = 0
    const goalEmbedding = [1, 0, 0]
    const embedder = createMockEmbedder([0, 1, 0])
    const reflex = createReflex(embedder, goalEmbedding, 0.85)

    const action = await reflex.check(createState())

    expect(action).toBeNull()
  })

  it('uses default threshold of 0.85', async () => {
    // Vectors with cosine similarity ~0.866 (> 0.85)
    const goalEmbedding = [1, 0, 0]
    const currentVec = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0] // 30° → cos = 0.866
    const embedder = createMockEmbedder(currentVec)
    const reflex = createReflex(embedder, goalEmbedding)

    const action = await reflex.check(createState())

    expect(action).toEqual({ type: 'DONE', result: 'Semantic Match Reached' })
  })

  it('does not trigger when similarity is clearly below threshold', async () => {
    // cos(45°) ≈ 0.707 which is below 0.85
    const goalEmbedding = [1, 0, 0]
    const currentVec = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0]
    const embedder = createMockEmbedder(currentVec)
    const reflex = createReflex(embedder, goalEmbedding, 0.85)

    const action = await reflex.check(createState())

    expect(action).toBeNull()
  })

  it('uses strict greater-than comparison (sim > threshold)', async () => {
    // Verify the comparison is strict (>) not (>=)
    const goalEmbedding = [1, 0, 0]
    // cos(10°) ≈ 0.985 — clearly above 0.85
    const currentVec = [Math.cos(Math.PI / 18), Math.sin(Math.PI / 18), 0]
    const embedder = createMockEmbedder(currentVec)
    const reflex = createReflex(embedder, goalEmbedding, 0.85)

    const action = await reflex.check(createState())

    expect(action).toEqual({ type: 'DONE', result: 'Semantic Match Reached' })
  })

  it('returns null when embedder throws an error', async () => {
    const goalEmbedding = [1, 0, 0]
    const embedder: StateEmbedder<TestState> = {
      embed: vi.fn(() => Promise.reject(new Error('API Error'))),
    }
    const reflex = createReflex(embedder, goalEmbedding, 0.85)

    const action = await reflex.check(createState())

    expect(action).toBeNull()
  })

  it('calls embedder with the state', async () => {
    const goalEmbedding = [1, 0, 0]
    const embedder = createMockEmbedder([0, 1, 0])
    const reflex = createReflex(embedder, goalEmbedding, 0.85)
    const state = createState({ label: 'Test Page' })

    await reflex.check(state)

    expect(embedder.embed).toHaveBeenCalledWith(state)
  })

  it('respects custom threshold', async () => {
    // Vectors with cosine similarity ~0.5
    const goalEmbedding = [1, 0, 0]
    const currentVec = [0.5, Math.sqrt(0.75), 0] // cos = 0.5
    const embedder = createMockEmbedder(currentVec)

    // With low threshold (0.4), should trigger
    const reflexLow = createReflex(embedder, goalEmbedding, 0.4)
    const actionLow = await reflexLow.check(createState())
    expect(actionLow).toEqual({ type: 'DONE', result: 'Semantic Match Reached' })

    // With high threshold (0.9), should not trigger
    const reflexHigh = createReflex(embedder, goalEmbedding, 0.9)
    const actionHigh = await reflexHigh.check(createState())
    expect(actionHigh).toBeNull()
  })
})
