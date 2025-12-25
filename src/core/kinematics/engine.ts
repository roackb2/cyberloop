import type { KinematicsConfig } from './interfaces';
import { add, angleBetween, norm, reject, scale, subtract } from './math';
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
    const s_pred = add(prev.position, prev.velocity);

    // 2. Update (Kalman Gain)
    const K = this.config.ProcessNoise / (this.config.ProcessNoise + this.config.MeasureNoise);

    // Innovation
    const innovation = subtract(observation, s_pred);
    const s_new = add(s_pred, scale(innovation, K));
    const v_new = subtract(s_new, prev.position);

    // 3. Calculate Heading
    const heading = subtract(s_new, origin);
    const prevHeading = prev.heading;

    // --- SAFETY CHECK START ---
    // Check if we have enough previous momentum to define a "path".
    // If prevHeading is near zero, we cannot calculate angle or projection.
    const prevHeadingNorm = norm(prevHeading);
    const hasMomentum = prev.stepIndex > 0 && prevHeadingNorm > 1e-9;
    // --- SAFETY CHECK END ---

    // 4. Calculate Coherence (Angle change)
    // Protected by hasMomentum to prevent NaN in angleBetween
    const coherence = hasMomentum ? angleBetween(heading, prevHeading) : 0;

    // 5. Calculate Cross-track Error (Vector Rejection)
    let error: Vector3D;

    if (!hasMomentum) {
      // No previous track to follow, so error is zero.
      // We accept the current heading as the new truth.
      error = heading.map(() => 0);
    } else {
      // Safe to reject because prevHeading is non-zero
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
