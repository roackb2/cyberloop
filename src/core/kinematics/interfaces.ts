import type { State } from '../types';
import type { Vector3D } from './types';

// Adapters must implement this to translate their Domain State (JSON) into Physics State (Vector)
// This allows the user to define any embedding strategy (OpenAI, local BERT, random projection, etc.)
export interface StateEmbedder<S extends State> {
  embed(state: S): Promise<Vector3D>;
}

// The v2.1 Configuration
export interface KinematicsConfig {
  ProcessNoise: number; // Q for EKF
  MeasureNoise: number; // R for EKF
  PID: {
    Kp: number;
    Ki: number;
    Kd: number;
  };
  // Threshold for semantic whiplash (cosine similarity or angle)
  // If sin(theta) > maxDeviation, trigger correction
  MaxDeviation: number;
}
