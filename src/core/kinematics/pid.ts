import { add, norm, scale, subtract } from './math';
import type { ControlSignal, Vector3D } from './types';

export class PIDController {
  private integral: Vector3D;
  private lastError: Vector3D | null = null;

  constructor(
    private Kp: number,
    private Ki: number,
    private Kd: number
  ) {
    this.integral = []; // Initialize empty, will adapt to dimension on first call
  }

  compute(error: Vector3D, dt = 1): ControlSignal {
    // Initialize integral term if needed
    if (this.integral.length === 0) {
      this.integral = error.map(() => 0);
    }

    this.lastError ??= error;

    // P Term
    const P = scale(error, this.Kp);

    // I Term
    this.integral = add(this.integral, scale(error, dt));
    const I = scale(this.integral, this.Ki);

    // D Term
    const derivative = scale(subtract(error, this.lastError), 1 / dt);
    const D = scale(derivative, this.Kd);

    // Total Correction: u = P + I + D
    const correction = add(add(P, I), D);

    // Update state
    this.lastError = error;

    const magnitude = norm(correction);

    // In v2.1, "Stability" is defined by the controller not fighting the agent.
    // If correction is small, we are stable.
    const isStable = magnitude < 0.1; // Magic number, should be configurable? Keeping simple for now.

    return {
      correctionVector: correction,
      magnitude,
      isStable,
      log: `PID(P=${norm(P).toFixed(4)}, I=${norm(I).toFixed(4)}, D=${norm(D).toFixed(4)})`
    };
  }

  reset() {
    this.integral = [];
    this.lastError = null;
  }
}
