/**
 * Quickstart — Tier 1: Opaque Agent
 *
 * The simplest possible cyberloop() usage. Wraps a mock agent that already
 * has a run() method. CyberLoop adds budget enforcement, telemetry, and
 * lightweight event hooks around the single run() call.
 *
 * Run: yarn examples:quickstart
 */

import type { AgentLike, AgentResult } from '@/core/agent-protocol'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Define a simple agent — any object with run() qualifies
// ---------------------------------------------------------------------------

const myAgent: AgentLike = {
  async run(input: string): Promise<AgentResult> {
    // Simulate some work
    console.log(`  [Agent] Processing: "${input}"`)
    await new Promise((r) => setTimeout(r, 100))
    return { output: `Result for "${input}": 42` }
  },
}

// ---------------------------------------------------------------------------
// 2. Wrap it with cyberloop()
// ---------------------------------------------------------------------------

const wrapped = cyberloop(myAgent, {
  budget: { maxSteps: 10 },
  on: {
    beforeStep(ctx) {
      console.log(`  [Hook] beforeStep — step=${ctx.step}`)
    },
    afterStep(_ctx, result) {
      console.log(`  [Hook] afterStep — action=${String(result.action)}`)
    },
    onHalt(reason) {
      console.log(`  [Hook] halted — reason=${reason}`)
    },
  },
})

// ---------------------------------------------------------------------------
// 3. Run it — same interface as the original agent
// ---------------------------------------------------------------------------

async function main() {
  console.log('🚀 CyberLoop Quickstart — Opaque Agent\n')

  const result = await wrapped.run('What is the meaning of life?')

  console.log(`\n✅ Output: ${result.output}`)
}

await main().catch(console.error)
