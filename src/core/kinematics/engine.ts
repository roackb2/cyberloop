import type { KinematicsConfig } from './interfaces';
import { add, angleBetween, norm, reject, scale, subtract } from './math';
import type { KinematicState, VectorN } from './types';

export class PhysicsEngine {
  constructor(private config: KinematicsConfig) { }

  /**
   * Updates the kinematic state based on a new observation.
   * Uses a simplified Kalman Filter (EKF) for state estimation.
   */
  update(
    prev: KinematicState,
    observation: VectorN,
    origin: VectorN
  ): { next: KinematicState; error: VectorN; coherence: number } {
    // 1. Predict (Simple Motion Model: assume constant velocity)
    const s_pred = add(prev.position, prev.velocity);

    // 2. Update (Kalman Gain)
    const K = this.config.ProcessNoise / (this.config.ProcessNoise + this.config.MeasureNoise);

    // Innovation
    const innovation = subtract(observation, s_pred);
    const s_new = add(s_pred, scale(innovation, K));
    const v_new = subtract(s_new, prev.position);

    // 3. Calculate Heading
    // Empirical decision: Use Local Velocity (Instantaneous Momentum) instead of Global Heading.
    // Experiments showed that Global Heading causes "semantic inertia," trapping agents in
    // obsolete contexts (e.g., hardware history vs modern CPU). Local Velocity allows
    // the agent to "forget the past" and exploit hub nodes more effectively.

    let heading = v_new;

    // Fallback: If velocity is near zero (no local movement), use global direction
    // to maintain orientation towards the origin/target context.
    // For t=0, v_new is equivalent to (s_new - origin), so this handles start gracefully.
    if (norm(heading) < 1e-9) {
      heading = subtract(s_new, origin);
    }

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
    let error: VectorN;

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
