import { describe, expect, it } from 'vitest'

import { DeltaScoreEvaluator } from '@/core/evaluators/delta-score'

describe('DeltaScoreEvaluator', () => {
  describe('Basic Functionality', () => {
    it('returns positive feedback when score increases', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(5, 10)
      
      expect(feedback).toBe(5)
    })

    it('returns negative feedback when score decreases', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(10, 5)
      
      expect(feedback).toBe(-5)
    })

    it('returns zero when score unchanged', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(7, 7)
      
      expect(feedback).toBe(0)
    })
  })

  describe('Custom Scoring Functions', () => {
    it('works with custom scoring logic', () => {
      // Score based on string length
      const evaluator = DeltaScoreEvaluator<string>(
        (prev, next) => next.length - prev.length
      )
      
      const feedback = evaluator.evaluate('hello', 'hello world')
      
      expect(feedback).toBe(6) // 11 - 5
    })

    it('works with object states', () => {
      interface State { hits: number; quality: number }
      
      // Score based on hits * quality
      const evaluator = DeltaScoreEvaluator<State>(
        (prev, next) => (next.hits * next.quality) - (prev.hits * prev.quality)
      )
      
      const prev = { hits: 10, quality: 0.5 }
      const next = { hits: 20, quality: 0.8 }
      
      const feedback = evaluator.evaluate(prev, next)
      
      expect(feedback).toBe(11) // (20 * 0.8) - (10 * 0.5) = 16 - 5 = 11
    })

    it('works with normalized scores', () => {
      // Always return score between -1 and 1
      const evaluator = DeltaScoreEvaluator<number>(
        (prev, next) => Math.max(-1, Math.min(1, (next - prev) / 100))
      )
      
      const feedback = evaluator.evaluate(0, 150)
      
      expect(feedback).toBe(1) // Clamped to 1
    })

    it('works with absolute scoring', () => {
      // Return absolute score of next state (ignore prev)
      const evaluator = DeltaScoreEvaluator<number>(
        (_prev, next) => next
      )
      
      const feedback = evaluator.evaluate(100, 42)
      
      expect(feedback).toBe(42)
    })
  })

  describe('Edge Cases', () => {
    it('handles zero values', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(0, 0)
      
      expect(feedback).toBe(0)
    })

    it('handles negative values', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(-10, -5)
      
      expect(feedback).toBe(5)
    })

    it('handles floating point values', () => {
      const evaluator = DeltaScoreEvaluator<number>((prev, next) => next - prev)
      
      const feedback = evaluator.evaluate(0.1, 0.3)
      
      expect(feedback).toBeCloseTo(0.2, 10)
    })

    it('handles identical object references', () => {
      interface State { value: number }
      const evaluator = DeltaScoreEvaluator<State>(
        (prev, next) => next.value - prev.value
      )
      
      const state = { value: 42 }
      const feedback = evaluator.evaluate(state, state)
      
      expect(feedback).toBe(0)
    })
  })

  describe('Real-World Usage Patterns', () => {
    it('GitHub search: score by hit count and entropy', () => {
      interface GhState { hits: number; entropy: number }
      
      // Good state: moderate hits (not too many, not too few) and low entropy
      const evaluator = DeltaScoreEvaluator<GhState>((prev, next) => {
        const prevScore = Math.min(next.hits, 50) * (1 - prev.entropy)
        const nextScore = Math.min(next.hits, 50) * (1 - next.entropy)
        return nextScore - prevScore
      })
      
      const prev = { hits: 100, entropy: 0.8 } // Too many hits, high entropy
      const next = { hits: 20, entropy: 0.2 }  // Good hits, low entropy
      
      const feedback = evaluator.evaluate(prev, next)
      
      expect(feedback).toBeGreaterThan(0) // Improvement
    })

    it('Dependency solver: score by resolved vs total', () => {
      interface DepState { resolved: number; total: number }
      
      const evaluator = DeltaScoreEvaluator<DepState>(
        (prev, next) => (next.resolved / next.total) - (prev.resolved / prev.total)
      )
      
      const prev = { resolved: 5, total: 10 }  // 50% resolved
      const next = { resolved: 8, total: 10 }  // 80% resolved
      
      const feedback = evaluator.evaluate(prev, next)
      
      expect(feedback).toBeCloseTo(0.3, 10) // 30% improvement
    })

    it('Multi-criteria scoring', () => {
      interface State { accuracy: number; speed: number; cost: number }
      
      // Weighted scoring: accuracy is most important
      const evaluator = DeltaScoreEvaluator<State>((prev, next) => {
        const score = (s: State) => 
          s.accuracy * 0.6 + s.speed * 0.3 - s.cost * 0.1
        return score(next) - score(prev)
      })
      
      const prev = { accuracy: 0.7, speed: 0.5, cost: 10 }
      const next = { accuracy: 0.9, speed: 0.4, cost: 15 }
      
      const feedback = evaluator.evaluate(prev, next)
      
      // Accuracy improved (+0.2 * 0.6 = +0.12)
      // Speed decreased (-0.1 * 0.3 = -0.03)
      // Cost increased (-5 * 0.1 = -0.5)
      // Net: 0.12 - 0.03 - 0.5 = -0.41
      expect(feedback).toBeCloseTo(-0.41, 2)
    })
  })

  describe('Type Safety', () => {
    it('preserves type information for state', () => {
      interface CustomState { value: number; label: string }
      
      const evaluator = DeltaScoreEvaluator<CustomState>(
        (prev, next) => {
          // TypeScript should know prev and next are CustomState
          return next.value - prev.value
        }
      )
      
      const prev: CustomState = { value: 1, label: 'start' }
      const next: CustomState = { value: 5, label: 'end' }
      
      const feedback = evaluator.evaluate(prev, next)
      
      expect(feedback).toBe(4)
    })

    it('works with union types', () => {
      type State = number | { score: number }
      
      const evaluator = DeltaScoreEvaluator<State>((prev, next) => {
        const getScore = (s: State) => typeof s === 'number' ? s : s.score
        return getScore(next) - getScore(prev)
      })
      
      expect(evaluator.evaluate(5, 10)).toBe(5)
      expect(evaluator.evaluate({ score: 5 }, { score: 10 })).toBe(5)
      expect(evaluator.evaluate(5, { score: 10 })).toBe(5)
    })
  })
})
