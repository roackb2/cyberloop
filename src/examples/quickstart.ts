import {
  CheapPassProbe,
  ProportionalLadder,
  RuleBasedStrategySelector,
  ReasonFailureClassifier,
  SimpleBudgetTracker,
  ThresholdEvaluator,
} from '@/core/defaults.js'
import type { Environment, Policy } from '@/core/interfaces'
import { Orchestrator } from '@/core/orchestrator.js'

// Simple numeric environment
const env: Environment<number, number> = {
  observe: () => 0,
  apply: async (a) => a,
}

// Minimal policy that chooses +1 if ladder is high, else -1
const simplePolicy: Policy<number, number, number> = {
  id: 'simple',
  capabilities: () => ({ explorationRange: [0, 3], cost: { step: 1 } }),
  decide: async (_state, ladder) => (ladder.level() >= 1 ? +1 : -1),
  adapt: (_score, _ladder) => {
    // Optionally adjust internal state based on feedback
  },
}

async function main() {
  const orch = new Orchestrator<number, number, number>({
    env,
    evaluator: new ThresholdEvaluator<number>(0),
    ladder: new ProportionalLadder({ gainUp: 0.5, gainDown: 0.5, max: 3 }),
    budget: new SimpleBudgetTracker(10),
    selector: new RuleBasedStrategySelector(),
    probes: [CheapPassProbe<number>()],
    policies: [simplePolicy],
    maxSteps: 5,
    failureClassifier: new ReasonFailureClassifier<number, number>(),
  })

  const res = await orch.run()
  console.table(res.logs)
}

await main()
