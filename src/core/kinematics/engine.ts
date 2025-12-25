import type { KinematicsConfig } from './interfaces';
import { add, angleBetween, reject, scale, subtract } from './math';
import type { KinematicState, Vector3D } from './types';

export class PhysicsEngine {
  constructor(private config: KinematicsConfig) { }

  /**
   * Updates the kinematic state based on a new observation.
   * Uses a simplified Kalman Filter (EKF) for state estimation.
   */
  update(
    prev: KinematicState,
    observation: Vector3D,
    origin: Vector3D
  ): { next: KinematicState; error: Vector3D; coherence: number } {
    // 1. Predict (Simple Motion Model: assume constant velocity)
    // s_pred = s_prev + v_prev * dt (assume dt=1 step)
    const s_pred = add(prev.position, prev.velocity);

    // 2. Update (Kalman Gain)
    // K = P / (P + R) -- Simplified scalar gain for high-dimensional conceptual space
    // We treat process noise/measure noise as scalar ratios for stability
    const K = this.config.ProcessNoise / (this.config.ProcessNoise + this.config.MeasureNoise);

    // Innovation: y = z - s_pred
    const innovation = subtract(observation, s_pred);

    // s_new = s_pred + K * y
    const s_new = add(s_pred, scale(innovation, K));

    // Update Velocity estimate: v_new = s_new - s_prev
    const v_new = subtract(s_new, prev.position);

    // 3. Calculate Heading D_i = S_i - Origin
    const heading = subtract(s_new, origin);
    const prevHeading = prev.heading;

    // 4. Calculate Coherence (Angle change)
    // If this is the first step, coherence is perfect (0 angle)
    const coherence = prev.stepIndex === 0 ? 0 : angleBetween(heading, prevHeading);

    // 5. Calculate Cross-track Error (Vector Rejection)
    // error = D_i - proj_{D_{i-1}}(D_i)
    // This represents the component of the new heading that is orthogonal to the previous momentum
    let error: Vector3D;
    if (prev.stepIndex === 0) {
      // No previous heading to define "track", so error is zero
      error = heading.map(() => 0);
    } else {
      error = reject(heading, prevHeading);
    }

    const nextState: KinematicState = {
      position: s_new,
      velocity: v_new,
      heading: heading,
      stepIndex: prev.stepIndex + 1,
    };

    return { next: nextState, error, coherence };
  }
}
