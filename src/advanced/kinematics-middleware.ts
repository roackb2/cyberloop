import type { Logger } from '../core/interfaces';
import { PhysicsEngine } from '../core/kinematics/engine';
import type { StateEmbedder } from '../core/kinematics/interfaces';
import { norm } from '../core/kinematics/math';
import { PIDController } from '../core/kinematics/pid';
import type { KinematicState, Vector3D } from '../core/kinematics/types';
import type { Middleware, StepContext, StepResult } from '../core/middleware/types';

/**
 * Kinematics data attached to `ctx.metadata['kinematics']` each step.
 */
export interface KinematicsSnapshot {
  position: Vector3D;
  velocity: Vector3D;
  error: Vector3D;
  errorMagnitude: number;
  correctionMagnitude: number;
  coherenceAngleDeg: number;
  isStable: boolean;
  stepIndex: number;
}

/**
 * Correction info attached to `ctx.metadata['kinematicsCorrection']` when drift is detected.
 */
export interface CorrectionInfo {
  vector: Vector3D;
  magnitude: number;
  log: string;
}

export interface KinematicsMiddlewareOpts<S> {
  /** Embedder to convert state → vector. */
  embedder: StateEmbedder<S>;
  /** Goal embedding vector (used as origin for physics). */
  goalEmbedding: number[];
  /** PID controller parameters. */
  pid?: {
    Kp?: number;
    Ki?: number;
    Kd?: number;
    stabilityThreshold?: number;
  };
  /** Physics engine (EKF) parameters. */
  physics?: {
    processNoise?: number;
    measureNoise?: number;
  };
  /** Optional logger for kinematics telemetry. */
  logger?: Logger;
}

/**
 * Advanced middleware that detects semantic drift using an EKF physics engine
 * and PID controller.
 *
 * Each step, it embeds the state into a vector, updates the physics model,
 * and computes a correction signal. Results are stored in `ctx.metadata`:
 *
 * - `metadata['kinematics']` — `KinematicsSnapshot` with position, velocity, error, etc.
 * - `metadata['kinematicsCorrection']` — `CorrectionInfo` (only when drift detected).
 *
 * The middleware **observes and annotates** — it does not halt or override actions.
 * Downstream middleware or the agent can read the correction to decide how to respond.
 */
export function kinematicsMiddleware<S>(opts: KinematicsMiddlewareOpts<S>): Middleware<S> {
  const pidOpts = opts.pid ?? {};
  const Kp = pidOpts.Kp ?? 1.0;
  const Ki = pidOpts.Ki ?? 0.0;
  const Kd = pidOpts.Kd ?? 0.0;
  const stabilityThreshold = pidOpts.stabilityThreshold ?? 0.1;

  const physicsOpts = opts.physics ?? {};
  const processNoise = physicsOpts.processNoise ?? 0.01;
  const measureNoise = physicsOpts.measureNoise ?? 0.1;

  const engine = new PhysicsEngine({ ProcessNoise: processNoise, MeasureNoise: measureNoise, PID: { Kp, Ki, Kd }, MaxDeviation: stabilityThreshold });
  const pid = new PIDController(Kp, Ki, Kd, stabilityThreshold);

  let origin: Vector3D | null = null;
  let lastPhysicsState: KinematicState | null = null;

  return {
    name: 'kinematics',

    setup(): Promise<void> {
      origin = opts.goalEmbedding;
      lastPhysicsState = null;
      pid.reset();
      return Promise.resolve();
    },

    async beforeStep(ctx: StepContext<S>): Promise<StepContext<S>> {
      const observation = await opts.embedder.embed(ctx.state);

      // First step: initialize physics state, no correction possible
      if (!lastPhysicsState) {
        lastPhysicsState = {
          position: observation,
          velocity: observation.map(() => 0),
          heading: observation.map(() => 0),
          stepIndex: 0,
        };

        const snapshot: KinematicsSnapshot = {
          position: observation,
          velocity: observation.map(() => 0),
          error: observation.map(() => 0),
          errorMagnitude: 0,
          correctionMagnitude: 0,
          coherenceAngleDeg: 0,
          isStable: true,
          stepIndex: 0,
        };

        return {
          ...ctx,
          metadata: { ...ctx.metadata, kinematics: snapshot },
        };
      }

      // Update physics
      const { next, error, coherence } = engine.update(lastPhysicsState, observation, origin!);

      // Compute PID correction
      const correction = pid.compute(error);

      const angleDeg = coherence * 180 / Math.PI;

      const snapshot: KinematicsSnapshot = {
        position: next.position,
        velocity: next.velocity,
        error,
        errorMagnitude: norm(error),
        correctionMagnitude: correction.magnitude,
        coherenceAngleDeg: angleDeg,
        isStable: correction.isStable,
        stepIndex: next.stepIndex,
      };

      const metadata: Record<string, unknown> = { ...ctx.metadata, kinematics: snapshot };

      if (!correction.isStable) {
        const correctionInfo: CorrectionInfo = {
          vector: correction.correctionVector,
          magnitude: correction.magnitude,
          log: correction.log,
        };
        metadata['kinematicsCorrection'] = correctionInfo;
      }

      lastPhysicsState = next;

      return { ...ctx, metadata };
    },

    afterStep(ctx: StepContext<S>, _result: StepResult<S>): Promise<void> {
      if (opts.logger) {
        const snapshot = ctx.metadata['kinematics'] as KinematicsSnapshot | undefined;
        if (snapshot) {
          opts.logger.info(
            {
              kinematics: {
                step: snapshot.stepIndex,
                angle_deg: parseFloat(snapshot.coherenceAngleDeg.toFixed(1)),
                error: parseFloat(snapshot.errorMagnitude.toFixed(4)),
                correction: parseFloat(snapshot.correctionMagnitude.toFixed(4)),
                stable: snapshot.isStable,
              },
            },
            `[Kinematics] Step ${snapshot.stepIndex}: Angle=${snapshot.coherenceAngleDeg.toFixed(1)}°, Err=${snapshot.errorMagnitude.toFixed(4)}, Stable=${snapshot.isStable}`,
          );
        }
      }
      return Promise.resolve();
    },
  };
}
