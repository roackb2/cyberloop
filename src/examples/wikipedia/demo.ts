import 'dotenv/config'

import { OpenAI } from 'openai';

import { WikipediaEmbedder } from '../../adapters/wikipedia/embedder';
import { WikipediaEnv } from '../../adapters/wikipedia/env';
import { WikipediaEvaluator } from '../../adapters/wikipedia/evaluator';
import { WikiLadder } from '../../adapters/wikipedia/ladder';
import { WikipediaPlanner } from '../../adapters/wikipedia/planner';
import { GreedyWikiPolicy } from '../../adapters/wikipedia/policy';
import { logger } from '../../adapters/wikipedia/telemetry';
import type { WikiAction, WikiState } from '../../adapters/wikipedia/types';
import { createControlBudget } from '../../core/budget/control-budget';
import { PhysicsEngine } from '../../core/kinematics/engine';
import { PIDController } from '../../core/kinematics/pid';
import { KinematicProbePolicy } from '../../core/kinematics/policy';
import { Orchestrator } from '../../core/orchestrator';
import { ChainPolicy } from '../../core/policy/chain';
import { BlacklistGuard } from '../../core/policy/guards/blacklist';
import { BoredomGuard } from '../../core/policy/guards/boredom';
import { LineOfSightReflex } from '../../core/policy/reflexes/line-of-sight';
import { SoftLandingReflex } from '../../core/policy/reflexes/soft-landing';

interface Scenario {
  name: string;
  start: string;
  end: string;
  description: string;
}

const SCENARIOS: Record<string, Scenario> = {
  'tech': {
    name: 'tech',
    start: 'Jacquard machine',
    end: 'Central processing unit',
    description: 'The classic loom to computer evolution path'
  },
  'revolution': {
    name: 'revolution',
    start: 'Coffee',
    end: 'French Revolution',
    description: 'From caffeine to guillotine'
  }
};

// Main Demo
async function main() {
  logger.info("🚀 Starting Project Ariadne: Wikipedia Deep-Dive Agent");

  if (!process.env.OPENAI_API_KEY) {
    logger.error("❌ OPENAI_API_KEY is required in .env");
    process.exit(1);
  }

  // Scenario Selection
  const args = process.argv.slice(2);
  const scenarioKey = args[0] || 'tech';
  const scenario = SCENARIOS[scenarioKey];

  if (!scenario) {
    logger.error(`❌ Unknown scenario: ${scenarioKey}`);
    logger.info(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  logger.info(`📖 Scenario: ${scenario.name} - ${scenario.description}`);
  logger.info(`🎯 Goal: ${scenario.start} -> ${scenario.end}`);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const startTopic = scenario.start;
  const endTopic = scenario.end;

  // 1. Setup Embedder & Goal
  const embedder = new WikipediaEmbedder(openai);

  // We need goal embedding for the greedy policy
  logger.info("🧠 Embedding Goal...");
  const goalResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `Topic: ${endTopic}`,
    encoding_format: 'float'
  });
  const goalEmbedding = goalResponse.data[0].embedding;

  // 2. Setup Policies
  const basePolicy = new GreedyWikiPolicy(embedder, goalEmbedding);

  // Wrap base policy with Guards and Reflexes
  const innerPolicy = new ChainPolicy<WikiState, WikiAction, number>(
    basePolicy,
    // Guards (Modify State)
    [
      new BlacklistGuard<WikiState>(),
      new BoredomGuard<WikiState>()
    ],
    // Reflexes (Priority Override)
    [
      new LineOfSightReflex(),
      new SoftLandingReflex(embedder, goalEmbedding)
    ]
  );

  const kinematics = new PhysicsEngine({
    ProcessNoise: 0.1,
    MeasureNoise: 0.5,
    PID: { Kp: 0.5, Ki: 0.0, Kd: 0.1 }, // Relaxed PID to avoid killing valid "Epiphany" jumps
    MaxDeviation: 0.6 // Relaxed Cone: Allow up to ~30-40 degrees deviation
  });

  const pid = new PIDController(0.5, 0.0, 0.1, 0.6);

  const kinematicPolicy = new KinematicProbePolicy(
    innerPolicy,
    embedder,
    kinematics,
    pid
  );

  // 3. Setup Orchestrator
  const env = new WikipediaEnv(startTopic, endTopic);
  const planner = new WikipediaPlanner();
  const evaluator = new WikipediaEvaluator(embedder);
  const ladder = new WikiLadder();

  const orchestrator = new Orchestrator({
    env,
    probePolicy: kinematicPolicy,
    planner,
    probes: [], // No separate probes, policy is the probe
    evaluator,
    ladder,
    budget: createControlBudget(100, 100),
    maxInnerSteps: 50, // Increased for longer paths
    logger
  });

  // 4. Run
  // We pass the "goal" as input to the planner, which will parse it
  // But our env is already hardcoded with start/end in this demo script.
  // The planner in this demo mainly just confirms the route or sets up initial state metadata if needed.
  await orchestrator.run(`${startTopic} -> ${endTopic}`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
});
