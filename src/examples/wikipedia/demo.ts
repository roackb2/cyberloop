import 'dotenv/config'

import { OpenAI } from 'openai';

import { WikipediaEmbedder } from '../../adapters/wikipedia/embedder';
import { WikipediaEnv } from '../../adapters/wikipedia/env';
import { WikipediaEvaluator } from '../../adapters/wikipedia/evaluator';
import { WikiLadder } from '../../adapters/wikipedia/ladder';
import { WikipediaPlanner } from '../../adapters/wikipedia/planner';
import { LlmCoTPolicy } from '../../adapters/wikipedia/policies/llm-cot';
import { NaiveGreedyPolicy } from '../../adapters/wikipedia/policies/naive';
import { StochasticHeuristicPolicy } from '../../adapters/wikipedia/policy';
import { logger } from '../../adapters/wikipedia/telemetry';
import type { WikiAction, WikiState } from '../../adapters/wikipedia/types';
import { createControlBudget } from '../../core/budget/control-budget';
import type { ProbePolicy } from '../../core/interfaces';
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

  // Argument Parsing
  const args = process.argv.slice(2);
  let scenarioKey = 'tech';
  let mode = 'cyberloop';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && i + 1 < args.length) {
      mode = args[i + 1];
      i++; // skip next
    } else if (!args[i].startsWith('--')) {
      scenarioKey = args[i];
    }
  }

  const scenario = SCENARIOS[scenarioKey];

  if (!scenario) {
    logger.error(`❌ Unknown scenario: ${scenarioKey}`);
    logger.info(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  logger.info(`📖 Scenario: ${scenario.name} - ${scenario.description}`);
  logger.info(`🎯 Goal: ${scenario.start} -> ${scenario.end}`);
  logger.info(`⚙️  Mode: ${mode}`);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const startTopic = scenario.start;
  const endTopic = scenario.end;

  // 1. Setup Embedder & Goal
  const embedder = new WikipediaEmbedder(openai);

  // We need goal embedding for the greedy policies and kinematic policy
  logger.info("🧠 Embedding Goal...");
  const goalResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: `Topic: ${endTopic}`,
    encoding_format: 'float'
  });
  const goalEmbedding = goalResponse.data[0].embedding;

  // 2. Setup Policy based on Mode
  let probePolicy: ProbePolicy<WikiState, WikiAction, number>;

  switch (mode) {
    case 'greedy':
      logger.info("🔹 using Baseline A: Pure Greedy Policy");
      probePolicy = new NaiveGreedyPolicy(embedder, goalEmbedding);
      break;

    case 'cot':
      logger.info("🔹 using Baseline B: LLM Chain-of-Thought Policy");
      probePolicy = new LlmCoTPolicy(openai);
      break;

    case 'cyberloop':
    default: {
      logger.info("🔹 using CyberLoop: Kinematic Probe Policy");
      // Setup CyberLoop Stack
      const basePolicy = new StochasticHeuristicPolicy(embedder, goalEmbedding);

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

      probePolicy = new KinematicProbePolicy(
        innerPolicy,
        embedder,
        kinematics,
        pid
      );
      break;
    }
  }

  // 3. Setup Orchestrator
  const env = new WikipediaEnv(startTopic, endTopic);
  const planner = new WikipediaPlanner();
  const evaluator = new WikipediaEvaluator(embedder);
  const ladder = new WikiLadder();

  const orchestrator = new Orchestrator({
    env,
    probePolicy,
    planner,
    probes: [], // No separate probes, policy is the probe
    evaluator,
    ladder,
    budget: createControlBudget(100, 100),
    maxInnerSteps: 15,
    logger
  });

  // 4. Run
  // We pass the "goal" as input to the planner, which will parse it
  // But our env is already hardcoded with start/end in this demo script.
  // The planner in this demo mainly just confirms the route or sets up initial state metadata if needed.
  const result = await orchestrator.run(`${startTopic} -> ${endTopic}`);

  logger.info(`🏁 Final Result [${mode}]: ${JSON.stringify(result)}`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
});
