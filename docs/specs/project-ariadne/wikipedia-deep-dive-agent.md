# Project Ariadne: Wikipedia Deep-Dive Agent (CyberLoop v2.1 Demo)

**Status:** Draft / Implementation Guide
**Target Component:** `src/examples/wikipedia`
**Core Feature:** Semantic Kinematics (Heading Hold)

---

## 1. The Challenge: High-Entropy Navigation

To validate **CyberLoop v2.1**, we need an environment that is:

1. **High Entropy:** Full of distractions (e.g., clicking "History of France" when researching "Computer Science").
2. **Semantically Continuous:** Concepts have clear vector relationships.
3. **Visualizable:** We can plot the agent's path vs. the ideal trajectory.

**The Wikipedia Game:**
Most LLM agents fail at "Wiki Racing" (getting from Page A to Page B) because they get distracted by interesting but irrelevant links. This is a perfect proxy for long-horizon R&D drift.

### The Metaphor: Ariadne's Thread

In Greek mythology, Ariadne gave Theseus a thread to navigate the Labyrinth.

* **The Minotaur:** The distraction (Semantic Drift).
* **The Thread:** CyberLoop's Kinematic Control (EKF + PID).
* **The Goal:** Connect two distant concepts (e.g., *Jacquard Loom* $\to$ *Microprocessors*).

---

## 2. System Architecture

This adapter implements the standard AICL interfaces (`Environment`, `StateEmbedder`, `ProbePolicy`) but adds the specific v2.1 kinematic logic.

### 2.1 The Components

1. **Environment (`WikipediaEnv`)**:
    * **Action Space:** `READ` (get content), `SCAN_LINKS` (get available paths), `Maps` (click link).
    * **State:** Current URL, page summary, depth from start.
    * **API:** Uses public Wikipedia API (no auth required).

2. **Embedder (`WikipediaEmbedder`)**:
    * **Input:** `State.summary` + `State.goal`.
    * **Model:** `text-embedding-3-small` (Fast, cheap, effective).
    * **Output:** `Vector3D`.

3. **Policy (`SemanticNavigationPolicy`)**:
    * **Role:** Deterministic Inner Loop.
    * **Logic:**
        1. Get all links on current page.
        2. Embed links (batch).
        3. Sort by cosine similarity to **Target Concept**.
        4. Select top link.
    * **Control Layer:** The `KinematicProbePolicy` wraps this. If the selected link causes a **Heading Error** (Drift), the PID controller intervenes.

---

## 3. Data Structures

### 3.1 State Definition (`src/adapters/wikipedia/types.ts`)

```typescript
import { State, Action } from '../../core/types';

export interface WikiState {
  currentTitle: string;
  summary: string;       // First paragraph for embedding
  url: string;
  goal: string;          // The target concept (e.g., "Microprocessors")
  history: string[];     // List of visited titles
  depth: number;
  // Available links for next move
  links: string[];
}

export type WikiAction =
  | { type: 'NAVIGATE'; title: string }
  | { type: 'DONE'; result: string }
  | { type: 'CORRECTION'; vector: number[]; magnitude: number; log: string }; // From v2.1 Core
```

### 3.2 Environment Interface (src/adapters/wikipedia/env.ts)

```typescript
import { Environment } from '../../core/interfaces';
import { WikiState, WikiAction } from './types';

export class WikipediaEnv implements Environment<WikiState, WikiAction> {
  constructor(
    private startTopic: string,
    private endTopic: string
  ) {}

  // 1. Fetch page content via fetch('[https://en.wikipedia.org/w/api.php](https://en.wikipedia.org/w/api.php)...')
  // 2. Parse HTML to get summary and links (cheerio or regex)
  // 3. Return immutable WikiState
  async observe(): Promise<WikiState> { ... }

  async apply(action: WikiAction): Promise<WikiState> {
    if (action.type === 'CORRECTION') {
      // v2.1 MAGIC:
      // The PID controller detected drift.
      // We don't move. We force the state to re-evaluate links
      // but penalized by the correction vector (re-ranking).
      console.log(`[CyberLoop] Applied Correction Force: ${action.magnitude}`);
      return this.currentState;
    }

    if (action.type === 'NAVIGATE') {
        // Move to next page
    }
    // ...
  }
}
```

## 4. Implementation Logic

### 4.1 The Embedder (`src/adapters/wikipedia/embedder.ts`)

We need a concrete implementation of `StateEmbedder`.

```typescript
import { StateEmbedder } from '../../core/kinematics/interfaces';
import { OpenAI } from 'openai';

export class WikipediaEmbedder implements StateEmbedder<WikiState> {
  constructor(private openai: OpenAI) {}

  async embed(state: WikiState): Promise<number[]> {
    // We embed the "Trajectory Vector": From Start -> Current
    // Or simply embed the current semantic context.

    const text = `Current Topic: ${state.currentTitle}\nContext: ${state.summary}`;

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  }
}
```

### 4.2 The Navigation Heuristic (src/adapters/wikipedia/policy.ts)

This is the Inner Policy that the Kinematic Kernel will wrap.

```typescript
import { ProbePolicy, Ladder } from '../../core/interfaces';

export class GreedyWikiPolicy implements ProbePolicy<WikiState, WikiAction, number> {

  // Deterministic "Greedy Best-First Search"
  async decide(state: WikiState, ladder: Ladder<number>): Promise<WikiAction> {
    if (state.currentTitle === state.goal) {
        return { type: 'DONE', result: "Arrived!" };
    }

    // 1. Semantic Similarity Match
    // In a real implementation, we would embed all links and pick the closest to 'state.goal'.
    // For simplicity/speed in this demo, we can use a lightweight keyword overlap
    // or a cached embedding lookup if available.

    // IF the Kinematic Policy wraps this, and we pick a "bad" link (Drift),
    // The Kinematic Policy will intercept the returned action
    // and replace it with a CORRECTION action if it deviates from the heading.

    const bestLink = findBestLink(state.links, state.goal);
    return { type: 'NAVIGATE', title: bestLink };
  }
}
```

## 5. Execution Script (`src/examples/wikipedia/demo.ts`)

The entry point to run the experiment.

```typescript
// Wiring it up
const kinematics = new PhysicsEngine({
    ProcessNoise: 0.1,
    MeasureNoise: 0.5,
    PID: { Kp: 0.8, Ki: 0.0, Kd: 0.1 },
    MaxDeviation: 0.4 // ~23 degrees drift allowed
});

const innerPolicy = new GreedyWikiPolicy();
const embedder = new WikipediaEmbedder(openai);

// THE COMPOSITION ROOT
const policy = new KinematicProbePolicy(
    innerPolicy,
    embedder,
    kinematics,
    new PIDController(...)
);

const orchestrator = new Orchestrator({
    env: new WikipediaEnv("Jacquard machine", "Central processing unit"),
    probePolicy: policy,
    // ...
});
```

### 6. Success Criteria

1. Trace Visualization: We should see CORRECTION actions appearing in the logs when the agent tries to navigate to irrelevant history topics.
2. Completion: The agent successfully navigates from "Jacquard machine" to "CPU" (or "Analytical Engine") without getting lost in "French History".
3. No Loops: The agent does not revisit pages (State history check).
