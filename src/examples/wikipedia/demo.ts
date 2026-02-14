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
import { logger, setupBenchmarkLogger } from '../../adapters/wikipedia/telemetry';
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
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY is required in .env");
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
    console.error(`❌ Unknown scenario: ${scenarioKey}`);
    console.info(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  // Setup Logging
  const logPath = setupBenchmarkLogger(scenario.name, mode);
  logger.info(`📝 Logging to: ${logPath}`);
  logger.info("🚀 Starting Project Ariadne: Wikipedia Deep-Dive Agent");
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

  // Reusable components
  const boredomGuard = new BoredomGuard<WikiState>(logger);
  const blacklistGuard = new BlacklistGuard<WikiState>();
  const reflexLineOfSight = new LineOfSightReflex<WikiState, WikiAction>({
    getLinks: (s) => s.links,
    getGoal: (s) => s.goal,
    createAction: (goal) => ({ type: 'NAVIGATE', title: goal }),
    logger,
  });
  const reflexSoftLanding = new SoftLandingReflex<WikiState, WikiAction>({
    embedder,
    goalEmbedding,
    createDoneAction: (reason) => ({ type: 'DONE', result: reason }),
    logger,
  });

  // Note: We use StochasticHeuristicPolicy as base for some to add entropy,
  // but NaiveGreedyPolicy is strictly deterministic top-1.

  switch (mode) {
    // --- BASELINE A: PURE GREEDY ---
    case 'greedy':
    case 'baseline-a1':
      logger.info("🔹 Mode: Baseline A1 (Pure Greedy)");
      // Just follows cosine similarity. No memory. No lookahead.
      probePolicy = new NaiveGreedyPolicy(embedder, goalEmbedding);
      break;

    // --- BASELINE A2: SMART GREEDY (GREEDY + MEMORY) ---
    case 'greedy-boredom':
    case 'baseline-a2':
      logger.info("🔹 Mode: Baseline A2 (Greedy + Boredom/Blacklist)");
      // Adds "Memory" (Guards) to Greedy. Should solve cycles but maybe zig-zag.
      probePolicy = new ChainPolicy<WikiState, WikiAction, number>(
        new NaiveGreedyPolicy(embedder, goalEmbedding),
        [blacklistGuard, boredomGuard],
        [] // No reflexes
      );
      break;

    // --- BASELINE A3: SUPER GREEDY (GREEDY + MEMORY + REFLEX) ---
    case 'greedy-reflex':
    case 'baseline-a3':
      logger.info("🔹 Mode: Baseline A3 (Greedy + Boredom + Reflexes)");
      // Adds "Reflexes" (Line of Sight). Should be very fast if lucky.
      probePolicy = new ChainPolicy<WikiState, WikiAction, number>(
        new NaiveGreedyPolicy(embedder, goalEmbedding),
        [blacklistGuard, boredomGuard],
        [reflexLineOfSight, reflexSoftLanding]
      );
      break;

    // --- BASELINE B: LLM CoT ---
    case 'cot':
    case 'baseline-b':
      logger.info("🔹 Mode: Baseline B (LLM Chain-of-Thought)");
      probePolicy = new LlmCoTPolicy(openai);
      break;

    // --- CYBERLOOP (STRICT): DETERMINISTIC KINEMATICS ---
    case 'cyberloop-strict': {
      logger.info("🔹 Mode: CyberLoop Strict (Kinematics + Greedy Base)");
      // Base is NaiveGreedy (Deterministic)
      const basePolicy = new NaiveGreedyPolicy(embedder, goalEmbedding);

      // Inner stack is same as A3/Super Greedy components
      const innerPolicy = new ChainPolicy<WikiState, WikiAction, number>(
        basePolicy,
        // Guards
        [blacklistGuard, boredomGuard],
        // Reflexes
        [reflexLineOfSight, reflexSoftLanding]
      );

      const kinematics = new PhysicsEngine({
        ProcessNoise: 0.1,
        MeasureNoise: 0.5,
        PID: { Kp: 0.5, Ki: 0.0, Kd: 0.1 }, // Relaxed PID
        MaxDeviation: 0.6 // Relaxed Cone
      });

      const pid = new PIDController(0.5, 0.0, 0.1, 0.6);

      probePolicy = new KinematicProbePolicy(
        innerPolicy,
        embedder,
        kinematics,
        pid,
        logger
      );
      break;
    }

    // --- CYBERLOOP (FULL): STOCHASTIC KINEMATICS ---
    case 'cyberloop':
    default: {
      logger.info("🔹 Mode: CyberLoop (Kinematics + Stochastic Base)");
      // Setup CyberLoop Stack
      // Base is Stochastic to allow for "Creativity" which PID then filters
      const basePolicy = new StochasticHeuristicPolicy(embedder, goalEmbedding);

      // Inner stack is same as A3/Super Greedy components
      const innerPolicy = new ChainPolicy<WikiState, WikiAction, number>(
        basePolicy,
        // Guards
        [blacklistGuard, boredomGuard],
        // Reflexes
        [reflexLineOfSight, reflexSoftLanding]
      );

      const kinematics = new PhysicsEngine({
        ProcessNoise: 0.1,
        MeasureNoise: 0.5,
        PID: { Kp: 0.5, Ki: 0.0, Kd: 0.1 }, // Relaxed PID
        MaxDeviation: 0.6 // Relaxed Cone
      });

      const pid = new PIDController(0.5, 0.0, 0.1, 0.6);

      probePolicy = new KinematicProbePolicy(
        innerPolicy,
        embedder,
        kinematics,
        pid,
        logger
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
    maxInnerSteps: 20, // slightly increased for long runs
    logger
  });

  // 4. Run
  const result = await orchestrator.run(`${startTopic} -> ${endTopic}`);

  logger.info(`🏁 Final Result [${mode}]: ${JSON.stringify(result)}`);
}

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
});
