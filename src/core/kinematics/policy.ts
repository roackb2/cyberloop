import type { Ladder, ProbePolicy } from '../interfaces';
import type { Action, Feedback, State } from '../types';
import type { PhysicsEngine } from './engine';
import type { StateEmbedder } from './interfaces';
import type { PIDController } from './pid';
import type { KinematicState, Vector3D } from './types';

export interface CorrectionAction {
  type: 'CORRECTION';
  vector: Vector3D;
  magnitude: number;
  log: string;
}

export class KinematicProbePolicy<S extends State, A extends Action, F extends Feedback> implements ProbePolicy<S, A, F> {
  public id = 'kinematic-policy';
  private origin: Vector3D | null = null;
  private lastPhysicsState: KinematicState | null = null;

  constructor(
    private innerPolicy: ProbePolicy<S, A, F>,
    private embedder: StateEmbedder<S>,
    private engine: PhysicsEngine,
    private pid: PIDController
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
    // 1. Convert generic State -> Vector3D
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
    const { next, error } = this.engine.update(this.lastPhysicsState, observation, this.origin);
    this.lastPhysicsState = next;

    // 3. Compute PID Correction
    const correction = this.pid.compute(error);

    // 4. Control Logic
    if (correction.isStable) {
      // If physics is stable (flying straight), delegate to domain logic
      return this.innerPolicy.decide(state, ladder);
    } else {
      // INTERVENTION: Semantic Whiplash Detected
      // Return a special correction action.
      // NOTE: The Action type A must be compatible with CorrectionAction.
      // We cast here assuming the user has configured the environment to handle this.
      return {
        type: 'CORRECTION',
        vector: correction.correctionVector,
        magnitude: correction.magnitude,
        log: correction.log
      } as unknown as A;
    }
  }

  adapt(feedback: F, ladder: Ladder<F>): void {
    this.innerPolicy.adapt?.(feedback, ladder);
  }
}
