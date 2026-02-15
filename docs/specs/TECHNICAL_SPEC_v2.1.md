# CyberLoop v2.1: Semantic Kinematics & Technical Specification

**Version:** 2.1.0 (Heading Hold Paradigm)
**Author:** Jay (Fienna) Liang
**Status:** **Active Implementation Standard**
**Supersedes:** AICL v0.3 (Architecture), CyberLoop v2.0 (Philosophy)

> **Note to AI Assistant (Windsurf/Cursor):**
> This document is the **SINGLE SOURCE OF TRUTH** for the mathematical models and control logic of CyberLoop v2.1.
>
> **Integration Strategy:**
> We are **NOT** rewriting the v1.0 core interfaces (`State`, `Probe`, `Orchestrator`).
> Instead, we are building a **"Kinematic Kernel"** (`src/core/kinematics`) that plugs into the existing architecture via a specialized `ProbePolicy`.
> Do not modify `src/core/interfaces/*.ts` unless absolutely necessary. Extend them via intersection types in the kinematics module.

---

## 1. Executive Summary: From Anchors to Heading

CyberLoop v2.1 solves the "Long-Horizon Drift" problem by modeling agent reasoning as a **physical trajectory**.

* **v1.0 (Current Codebase):** Uses discrete, rule-based logic (e.g., `if hits < 5 then broaden`).
* **v2.0 (Deprecated):** Tried to anchor the agent to the starting point (Absolute Anchoring). This failed for exploration tasks.
* **v2.1 (This Spec):** Implements **"Heading Hold" (Trajectory Smoothing)**.
  * The agent is allowed to explore infinitely far from the start.
  * Constraint is applied only to the **coherence of the path** (Heading).
  * We use **Vector Rejection** to calculate error and **PID Controllers** to correct semantic whiplash.

---

## 2. The Semantic Physics Engine (Math Spec)

**All implementations must strictly follow these formulas.**

### 2.1 Definitions

* $\vec{\tau}$ (**Task Origin**): Embedding of the initial prompt.
* $\vec{S}_i$ (**Estimated State**): The EKF-filtered location of the agent.
* $\vec{D}_i$ (**Heading Vector**): The current trajectory vector relative to origin ($\vec{D}_i = \vec{S}_i - \vec{\tau}$).

### 2.2 Mechanism A: State Estimation (EKF)

**Purpose:** Smooth out the noise ("jitter") of individual LLM steps to find true intent.

$$
\begin{aligned}
\hat{s}_i^- &= \vec{S}_{i-1} + \vec{v}_{i-1} \cdot \Delta t \quad \text{(Predict)} \\
\vec{S}_i &= \hat{s}_i^- + K \cdot (\vec{E}_i - \hat{s}_i^-) \quad \text{(Update)}
\end{aligned}
$$

### 2.3 Mechanism B: Coherence (The Cone)

**Purpose:** Detect "Semantic Whiplash" (sudden illogical turns).

$$
\theta_i = \arccos \left( \frac{\vec{D}_i \cdot \vec{D}_{i-1}}{\|\vec{D}_i\| \|\vec{D}_{i-1}\|} \right)
$$

**Trigger:** If $\sin(\theta_i) > \text{DynamicThreshold}$, initiate correction.

### 2.4 Mechanism C: Actuation (Cross-track Error)

**Purpose:** Calculate how far "off-course" the agent is relative to its own previous momentum. We use **Vector Rejection** (the orthogonal component).

$$
\vec{e}_i = \vec{D}_i - \text{proj}_{\vec{D}_{i-1}}(\vec{D}_i)
$$

**PID Control:**
$$
u(i) = K_p \vec{e}_i + K_i \sum \vec{e}_i \Delta t + K_d \frac{\vec{e}_i - \vec{e}_{i-1}}{\Delta t}
$$

## 3. Implementation Interfaces (The Bridge)

We need to bridge the generic `State` from v1.0 with the rigorous `VectorN` of v2.1.

### 3.1 The Kinematics Type Definition

Create these in `src/core/kinematics/types.ts`.

```typescript
export type VectorN = number[]; // N-dimensional embedding vector

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
```

### 3.2 Extending the Core Interfaces

We do NOT change `src/core/interfaces/policy.ts`. Instead, we create a specific Policy that knows about physics.

The "Vectorizable" Contract: Any generic `State` (e.g., `GitHubState`) passed to a v2.1 agent must be convertible to a vector.

```typescript
// src/core/kinematics/interfaces.ts

import { State } from '../types';

// Adapters must implement this to translate their Domain State (JSON) into Physics State (Vector)
export interface StateEmbedder<S extends State> {
  embed(state: S): Promise<VectorN>;
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
}
```

## 4. Component Architecture

### 4.1 The Physics Engine (`src/core/kinematics/engine.ts`)

A pure, deterministic class that holds the math. It does not know about LLMs or GitHub.

```typescript
class PhysicsEngine {
  update(
    prev: KinematicState,
    observation: VectorN
  ): { next: KinematicState; error: VectorN } {
    // 1. EKF Predict & Update
    // 2. Calculate Heading D_i
    // 3. Calculate Cross-track Error e_i (Vector Rejection)
    // Returns the new physics state and the raw error vector
  }
}
```

### 4.2 The Kinematic Policy (src/core/kinematics/policy.ts)

This is the Adapter that plugs into the existing Orchestrator. It implements the standard ProbePolicy interface.

```typescript
// Implements the v1.0 ProbePolicy interface
class KinematicProbePolicy<S> implements ProbePolicy<S, Action, Feedback> {

  constructor(
    private embedder: StateEmbedder<S>,
    private engine: PhysicsEngine,
    private pid: PIDController
  ) {}

  async decide(state: S, ladder: Ladder): Promise<Action> {
    // 1. Convert generic State -> VectorN (using Embedder)
    const observation = await this.embedder.embed(state);

    // 2. Update Physics Engine
    const { next, error } = this.engine.update(this.lastPhysicsState, observation);

    // 3. Compute PID Correction
    const correction = this.pid.compute(error);

    // 4. Logic:
    // If correction.magnitude is LOW -> Continue exploration (Standard Probe Logic)
    // If correction.magnitude is HIGH -> Generate a "Correction Action"

    if (correction.isStable) {
       // Delegate to a standard domain logic (e.g., check hit counts)
       return this.innerPolicy.decide(state, ladder);
    } else {
       // INTERVENTION!
       // Return a special action that injects the correction vector
       // back into the environment or prompt.
       return { type: 'CORRECTION', vector: correction.u };
    }
  }
}
```

## 5. Implementation Roadmap for AI Assistant

When implementing v2.1, follow this sequence to avoid breaking existing code:

1. **Scaffold**: Create `src/core/kinematics/` folder.
2. **Math First**: Implement `VectorN` operations (dot product, norm, projection, rejection) in `src/core/geometry/vector.ts` (previously `src/core/kinematics/math.ts`). **Do not use external heavy math libs**, keep it lightweight.
3. **Engine**: Implement `PhysicsEngine` with EKF and Heading logic.
4. **Controller**: Implement `PIDController`.
5. **Integration**: Create `KinematicProbePolicy`.

### Constraint Checklist

* [ ] **No breaking changes** to `src/core/orchestrator.ts`.
* [ ] **No breaking changes** to `src/examples/github`.
* [ ] All v2.1 math must be **pure functions** (testable without mocks).
* [ ] `VectorRejection` must be used for error calculation (not Euclidean distance).

---

## 6. SDK Integration (v2.2)

In v2.2, the kinematics system is also available as **middleware** for the `cyberloop()` wrapper, providing an alternative to the `KinematicProbePolicy` approach described in Section 4.2.

```typescript
import { kinematicsMiddleware } from 'cyberloop/advanced'

const controlled = cyberloop(agent, {
  middleware: [
    kinematicsMiddleware({
      embedder,          // StateEmbedder<S> — same as Section 3.2
      goalEmbedding,     // VectorN — task origin τ
      pid: { Kp: 0.5, Ki: 0.0, Kd: 0.1, stabilityThreshold: 0.6 },
      physics: { processNoise: 0.1, measureNoise: 0.5 },
    }),
  ],
})
```

**Key difference:** `kinematicsMiddleware` **observes and annotates** (via `metadata['kinematics']` and `metadata['kinematicsCorrection']`) but does not halt or override actions. It is a thin adapter over the same `PhysicsEngine` and `PIDController` described in Sections 4.1 and 4.2.

The `KinematicProbePolicy` (Section 4.2) remains available for Orchestrator-based usage where the policy itself needs to act on corrections.

---
*End of Technical Spec v2.1*
