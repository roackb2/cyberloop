# Wikipedia Navigation Experiment (Ablation Study)

This directory contains the tools and scripts to reproduce the **Ablation Study** for the CyberLoop paper. The goal is to dissect the contribution of each component (Guards, Reflexes, Kinematics) to the agent's performance in avoiding infinite loops and navigating efficiently.

## Directory Structure

```
experiments/wikipedia/
├── visualization.py       # Python script to generate PCA trajectory plots
├── requirements.txt       # Python dependencies for analysis
├── figures/               # Output directory for generated plots
└── README.md             # This file
```

## Setup

1. **Install Python Dependencies:**

   ```bash
   pip install -r experiments/wikipedia/requirements.txt
   ```

2. **Ensure Environment Variables:**
   Make sure your `.env` file in the root of the repository contains:

   ```env
   OPENAI_API_KEY=sk-...
   ```

## Running the Benchmarks

Run the Wikipedia agent in different modes to collect data. The logs will be saved to `local/benchmarks/`.

### 1. Baseline A1: Pure Greedy (Negative Control)

Expected Behavior: Gets stuck in infinite loops (e.g., "14 July" loop).

```bash
npm run examples:wikipedia -- --mode baseline-a1 revolution
```

### 2. Baseline A2: Greedy + Memory (Boredom/Blacklist)

Expected Behavior: Breaks loops but exhibits "zig-zag" (whiplash) behavior.

```bash
npm run examples:wikipedia -- --mode baseline-a2 revolution
```

### 3. Baseline A3: Greedy + Memory + Reflexes (Speed)

Expected Behavior: Faster navigation due to line-of-sight shortcuts, but still lacks smoothness.

```bash
npm run examples:wikipedia -- --mode baseline-a3 revolution
```

### 4. CyberLoop Strict: Kinematics + Greedy (Safety Brake)

Expected Behavior: Validates that PID control stabilizes even a deterministic dumb policy.

```bash
npm run examples:wikipedia -- --mode cyberloop-strict revolution
```

### 5. CyberLoop Full: Kinematics + Stochastic (Stabilizing Filter)

Expected Behavior: Best performance. The stochastic policy generates creative options, and PID selects the one with the best semantic momentum.

```bash
npm run examples:wikipedia -- --mode cyberloop revolution
```

## Analysis & Visualization

Once you have run the experiments, generate the PCA trajectory plots:

```bash
python3 experiments/wikipedia/visualization.py
```

This will parse the logs from `local/benchmarks/`, compute embeddings for the visited nodes, and generate comparative plots in `experiments/wikipedia/figures/`.
