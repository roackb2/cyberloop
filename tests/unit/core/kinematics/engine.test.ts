import { describe, expect, it } from 'vitest';

import { PhysicsEngine } from '../../../../src/core/kinematics/engine';
import type { KinematicsConfig } from '../../../../src/core/kinematics/interfaces';
import type { KinematicState } from '../../../../src/core/kinematics/types';

describe('Physics Engine', () => {
  const config: KinematicsConfig = {
    ProcessNoise: 0.1,
    MeasureNoise: 0.1, // Equal noise -> K = 0.5
    PID: { Kp: 1, Ki: 0, Kd: 0 },
    MaxDeviation: 0.5
  };

  const engine = new PhysicsEngine(config);
  const origin = [0, 0, 0];

  it('should initialize state correctly on first update', () => {
    // Initial state (t=0)
    const startState: KinematicState = {
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      heading: [0, 0, 0],
      stepIndex: 0
    };

    // Observation at t=1: Moved along X axis
    const observation = [1, 0, 0];

    const { next, error } = engine.update(startState, observation, origin);

    // Predict: s_pred = 0 + 0 = 0
    // Innov: 1 - 0 = 1
    // Gain K: 0.1 / (0.2) = 0.5
    // Update: 0 + 0.5 * 1 = 0.5
    expect(next.position).toEqual([0.5, 0, 0]);

    // Velocity: 0.5 - 0 = 0.5
    expect(next.velocity).toEqual([0.5, 0, 0]);

    // Heading: 0.5 - 0 = 0.5
    expect(next.heading).toEqual([0.5, 0, 0]);

    // Step index increases
    expect(next.stepIndex).toBe(1);

    // Error (rejection) should be zero because there was no previous heading to deviate from
    expect(error).toEqual([0, 0, 0]);
  });

  it('should detect cross-track error (Vector Rejection)', () => {
    // t=1 State: Moving along X
    const state1: KinematicState = {
      position: [1, 0, 0],
      velocity: [1, 0, 0],
      heading: [1, 0, 0],
      stepIndex: 1
    };

    // t=2 Observation: Suddenly moved up Y (Semantic Whiplash)
    // Position now [2, 1, 0] (Moved [1, 1, 0] from [1,0,0]?)
    // Let's say observation is [2, 1, 0]
    const observation = [2, 1, 0];

    const { error } = engine.update(state1, observation, origin);

    // Vector Rejection of [2, 0.5, 0] on [1, 0, 0]
    // Proj of [2, 0.5, 0] on X is [2, 0, 0]
    // Rejection is [0, 0.5, 0]

    expect(error[1]).toBeCloseTo(0.5); // Y component error
    expect(error[0]).toBeCloseTo(0);   // X component should be 0 (on track)
  });
});
