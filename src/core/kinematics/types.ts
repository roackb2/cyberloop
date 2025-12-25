export type Vector3D = number[]; // Embedding vector - named Vector3D but can be N-dimensional

// The Physics State (Hidden from the generic Orchestrator)
export interface KinematicState {
  position: Vector3D;      // S_i (Filtered)
  velocity: Vector3D;      // v_i
  heading: Vector3D;       // D_i
  stepIndex: number;
}

// The Control Signal returned by the PID controller
export interface ControlSignal {
  correctionVector: Vector3D; // u(i)
  magnitude: number;          // How strong the correction is (0-1)
  isStable: boolean;          // Should we stop?
  log: string;               // Explanation for debug traces
}

export interface CorrectionAction {
  type: 'CORRECTION';
  vector: Vector3D;
  magnitude: number;
  log: string;
}
