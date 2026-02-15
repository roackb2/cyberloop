/** An N-dimensional embedding vector. */
export type VectorN = number[];

/** @deprecated Use `VectorN` instead. Alias kept for backward compatibility. */
export type Vector3D = VectorN;

// The Physics State (Hidden from the generic Orchestrator)
export interface KinematicState {
  position: VectorN;      // S_i (Filtered)
  velocity: VectorN;      // v_i
  heading: VectorN;       // D_i
  stepIndex: number;
}

// The Control Signal returned by the PID controller
export interface ControlSignal {
  correctionVector: VectorN; // u(i)
  magnitude: number;          // How strong the correction is (0-1)
  isStable: boolean;          // Should we stop?
  log: string;               // Explanation for debug traces
}

export interface CorrectionAction {
  type: 'CORRECTION';
  vector: VectorN;
  magnitude: number;
  log: string;
}
