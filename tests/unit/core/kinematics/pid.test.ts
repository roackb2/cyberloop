import { describe, expect, it } from 'vitest'

import { PIDController } from '@/core/kinematics/pid'

describe('PIDController', () => {
  describe('P-only controller', () => {
    it('returns correction proportional to error', () => {
      const pid = new PIDController(1, 0, 0)
      const error = [1, 0, 0]

      const result = pid.compute(error)

      // P = Kp * error = 1 * [1,0,0] = [1,0,0]
      expect(result.correctionVector).toEqual([1, 0, 0])
      expect(result.magnitude).toBeCloseTo(1)
    })

    it('scales correction by Kp', () => {
      const pid = new PIDController(0.5, 0, 0)
      const error = [2, 0, 0]

      const result = pid.compute(error)

      // P = 0.5 * [2,0,0] = [1,0,0]
      expect(result.correctionVector).toEqual([1, 0, 0])
    })

    it('handles multi-dimensional error', () => {
      const pid = new PIDController(1, 0, 0)
      const error = [1, 2, 3]

      const result = pid.compute(error)

      expect(result.correctionVector).toEqual([1, 2, 3])
    })
  })

  describe('I-only controller', () => {
    it('accumulates error over time', () => {
      const pid = new PIDController(0, 1, 0)

      pid.compute([1, 0, 0]) // integral = [1,0,0]
      const result = pid.compute([1, 0, 0]) // integral = [2,0,0]

      // I = Ki * integral = 1 * [2,0,0] = [2,0,0]
      expect(result.correctionVector).toEqual([2, 0, 0])
    })

    it('scales by Ki', () => {
      const pid = new PIDController(0, 0.5, 0)

      pid.compute([2, 0, 0]) // integral = [2,0,0]

      // I = 0.5 * [2,0,0] = [1,0,0]
      const result = pid.compute([0, 0, 0]) // integral = [2,0,0] (no new error)

      expect(result.correctionVector).toEqual([1, 0, 0])
    })
  })

  describe('D-only controller', () => {
    it('returns zero on first call (no previous error)', () => {
      const pid = new PIDController(0, 0, 1)
      const error = [1, 0, 0]

      const result = pid.compute(error)

      // D = Kd * (error - lastError) / dt
      // On first call, lastError defaults to error, so derivative = 0
      expect(result.correctionVector).toEqual([0, 0, 0])
      expect(result.magnitude).toBe(0)
    })

    it('responds to change in error', () => {
      const pid = new PIDController(0, 0, 1)

      pid.compute([0, 0, 0]) // Set lastError = [0,0,0]
      const result = pid.compute([1, 0, 0]) // derivative = [1,0,0]

      // D = 1 * [1,0,0] = [1,0,0]
      expect(result.correctionVector).toEqual([1, 0, 0])
    })
  })

  describe('Full PID controller', () => {
    it('combines P, I, D terms', () => {
      const pid = new PIDController(1, 0.1, 0.5)

      // First call: error = [1,0,0]
      // P = [1,0,0], I = 0.1*[1,0,0] = [0.1,0,0], D = 0 (first call)
      const result1 = pid.compute([1, 0, 0])
      expect(result1.correctionVector[0]).toBeCloseTo(1.1) // P + I + D = 1 + 0.1 + 0

      // Second call: error = [2,0,0]
      // P = [2,0,0], I = 0.1*[3,0,0] = [0.3,0,0], D = 0.5*[1,0,0] = [0.5,0,0]
      const result2 = pid.compute([2, 0, 0])
      expect(result2.correctionVector[0]).toBeCloseTo(2.8) // 2 + 0.3 + 0.5
    })
  })

  describe('Stability detection', () => {
    it('reports stable when correction magnitude < threshold', () => {
      const pid = new PIDController(1, 0, 0, 0.5)
      const error = [0.1, 0, 0]

      const result = pid.compute(error)

      expect(result.isStable).toBe(true)
      expect(result.magnitude).toBeCloseTo(0.1)
    })

    it('reports unstable when correction magnitude >= threshold', () => {
      const pid = new PIDController(1, 0, 0, 0.1)
      const error = [1, 0, 0]

      const result = pid.compute(error)

      expect(result.isStable).toBe(false)
      expect(result.magnitude).toBeCloseTo(1)
    })

    it('uses default threshold of 0.1', () => {
      const pid = new PIDController(1, 0, 0)

      const stableResult = pid.compute([0.05, 0, 0])
      expect(stableResult.isStable).toBe(true)

      pid.reset()
      const unstableResult = pid.compute([0.5, 0, 0])
      expect(unstableResult.isStable).toBe(false)
    })
  })

  describe('Log output', () => {
    it('includes P, I, D norms in log string', () => {
      const pid = new PIDController(1, 0.1, 0.5)
      const result = pid.compute([1, 0, 0])

      expect(result.log).toMatch(/^PID\(P=/)
      expect(result.log).toContain('I=')
      expect(result.log).toContain('D=')
    })
  })

  describe('Reset', () => {
    it('clears integral and lastError', () => {
      const pid = new PIDController(0, 1, 0)

      // Accumulate integral
      pid.compute([1, 0, 0])
      pid.compute([1, 0, 0])

      pid.reset()

      // After reset, integral should be zero again
      const result = pid.compute([1, 0, 0])
      // I = Ki * integral = 1 * [1,0,0] = [1,0,0] (fresh start)
      expect(result.correctionVector).toEqual([1, 0, 0])
    })
  })

  describe('dt parameter', () => {
    it('scales integral by dt', () => {
      const pid = new PIDController(0, 1, 0)

      const result = pid.compute([1, 0, 0], 2)

      // integral = error * dt = [2,0,0]
      // I = Ki * integral = 1 * [2,0,0] = [2,0,0]
      expect(result.correctionVector).toEqual([2, 0, 0])
    })

    it('scales derivative by 1/dt', () => {
      const pid = new PIDController(0, 0, 1)

      pid.compute([0, 0, 0], 2)
      const result = pid.compute([2, 0, 0], 2)

      // derivative = (error - lastError) / dt = [2,0,0] / 2 = [1,0,0]
      // D = Kd * derivative = 1 * [1,0,0] = [1,0,0]
      expect(result.correctionVector).toEqual([1, 0, 0])
    })
  })

  describe('Edge cases', () => {
    it('handles zero error', () => {
      const pid = new PIDController(1, 0.1, 0.5)
      const result = pid.compute([0, 0, 0])

      expect(result.correctionVector).toEqual([0, 0, 0])
      expect(result.magnitude).toBe(0)
      expect(result.isStable).toBe(true)
    })

    it('handles high-dimensional vectors', () => {
      const pid = new PIDController(1, 0, 0)
      const error = Array.from({ length: 1536 }, (_, i) => i * 0.001)

      const result = pid.compute(error)

      expect(result.correctionVector).toHaveLength(1536)
      expect(result.magnitude).toBeGreaterThan(0)
    })
  })
})
