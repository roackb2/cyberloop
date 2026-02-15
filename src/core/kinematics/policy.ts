import type { Ladder, Logger, ProbePolicy } from '../interfaces';
import type { Action, Feedback, State } from '../types';
import type { PhysicsEngine } from './engine';
import type { StateEmbedder } from './interfaces';
import { norm } from './math';
import type { PIDController } from './pid';
import type { CorrectionAction, KinematicState, VectorN } from './types';

export class KinematicProbePolicy<S extends State, A extends Action, F extends Feedback> implements ProbePolicy<S, A, F> {
  public id = 'kinematic-policy';
  private origin: VectorN | null = null;
  private lastPhysicsState: KinematicState | null = null;

  constructor(
    private innerPolicy: ProbePolicy<S, A, F>,
    private embedder: StateEmbedder<S>,
    private engine: PhysicsEngine,
    private pid: PIDController,
    private logger?: Logger
  ) { }

  initialize(state: S): void {
    this.innerPolicy.initialize(state);
    // Reset physics state on initialization
    this.origin = null;
    this.lastPhysicsState = null;
    this.pid.reset();
  }

  isStable(state: S): boolean {
    // Stability is primarily determined by the goal (inner policy)
    // We do not prevent stopping if the physics is unstable,
    // because if we reached the goal, we are done.
    return this.innerPolicy.isStable(state);
  }

  async decide(state: S, ladder: Ladder<F>): Promise<A> {
    // 1. Convert generic State -> VectorN
    const observation = await this.embedder.embed(state);

    // Initialize Origin if this is the first step after initialize()
    if (!this.origin) {
      this.origin = observation;
      this.lastPhysicsState = {
        position: observation,
        velocity: observation.map(() => 0),
        heading: observation.map(() => 0),
        stepIndex: 0
      };
      // No movement yet, so no correction possible. Delegate to inner policy.
      return this.innerPolicy.decide(state, ladder);
    }

    // Safety check for Typescript (guaranteed by logic above)
    if (!this.lastPhysicsState) throw new Error("Physics state not initialized");

    // 2. Update Physics Engine
    // We pass the previous state and the NEW observation
    const { next, error, coherence } = this.engine.update(this.lastPhysicsState, observation, this.origin);

    // 3. Compute PID Correction
    const correction = this.pid.compute(error);

    // Telemetry Logging
    if (this.logger) {
      const angleDeg = (coherence * 180 / Math.PI).toFixed(1);
      const velocityMag = norm(next.velocity).toFixed(4);
      const errorMag = norm(error).toFixed(4);
      const correctionMag = correction.magnitude.toFixed(4);

      this.logger.info({
        kinematics: {
          angle_deg: parseFloat(angleDeg),
          velocity: parseFloat(velocityMag),
          error: parseFloat(errorMag),
          correction: parseFloat(correctionMag),
          stable: correction.isStable,
          step: next.stepIndex
        }
      }, `[Kinematics] Step ${next.stepIndex}: Angle=${angleDeg}°, Err=${errorMag}, Corr=${correctionMag}, Stable=${correction.isStable}`);
    }

    // 4. Control Logic
    if (correction.isStable) {
      // If physics is stable (flying straight), delegate to domain logic
      // Only update internal physics state if we accept the move
      this.lastPhysicsState = next;
      return this.innerPolicy.decide(state, ladder);
    } else {
      // INTERVENTION: Semantic Whiplash Detected
      // Return a special correction action.
      // NOTE: The Action type A must be compatible with CorrectionAction.
      // We cast here assuming the user has configured the environment to handle this.
      const action: CorrectionAction = {
        type: 'CORRECTION',
        vector: correction.correctionVector,
        magnitude: correction.magnitude,
        log: correction.log
      };

      this.logger?.warn(`[Kinematics] ⚠️ Correction Triggered! Magnitude ${correction.magnitude.toFixed(2)} > Threshold`);

      return action as unknown as A;
    }
  }

  adapt(feedback: F, ladder: Ladder<F>): void {
    this.innerPolicy.adapt?.(feedback, ladder);
  }
}
