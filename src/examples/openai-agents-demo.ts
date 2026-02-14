/**
 * OpenAI Agents SDK Compatibility Demo
 *
 * Shows that cyberloop() is a non-invasive wrapper around the OpenAI Agents SDK.
 * The Agent works exactly as before — CyberLoop just observes and enforces budget.
 *
 * Requires: OPENAI_API_KEY environment variable.
 *
 * Run: yarn examples:openai-agents
 */

import 'dotenv/config'

import { Agent, run, tool } from '@openai/agents'
import { Command } from 'commander'

import type { AgentResult } from '@/core/agent-protocol'
import type { Middleware, StepContext } from '@/core/middleware/types'
import { cyberloop } from '@/core/wrapper'

// ---------------------------------------------------------------------------
// 1. Create an OpenAI Agent with a simple tool
// ---------------------------------------------------------------------------

const lookupTool = tool({
  name: 'lookup',
  description: 'Look up a fact by topic. Returns a short factual answer.',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The topic to look up, e.g. "speed of light"' },
    },
    required: ['topic'],
    additionalProperties: false,
  } as const,
  execute: (rawInput: unknown) => {
    const { topic } = rawInput as { topic: string }
    console.log(`  🔧 [Tool] lookup("${topic}")`)
    const facts: Record<string, string> = {
      'speed of light': '299,792,458 meters per second',
      'population of france': 'approximately 68 million (2024)',
      'boiling point of water': '100°C (212°F) at standard atmospheric pressure',
      'distance to moon': 'approximately 384,400 km',
      'pi': '3.14159265358979...',
    }
    const key = topic.toLowerCase()
    const match = Object.entries(facts).find(([k]) => key.includes(k))
    const answer = match ? match[1] : `No data found for "${topic}". Please try a different query.`
    return Promise.resolve(answer)
  },
})

const agent = new Agent({
  name: 'FactAssistant',
  instructions: `You are a helpful assistant. Use the lookup tool to find facts for the user.
After looking up information, provide a clear and concise answer.`,
  tools: [lookupTool],
})

// ---------------------------------------------------------------------------
// 2. Custom middleware: track invocations
// ---------------------------------------------------------------------------

function invocationTracker(): Middleware<unknown> {
  let calls = 0
  return {
    name: 'invocation-tracker',
    setup(): Promise<void> {
      calls = 0
      return Promise.resolve()
    },
    beforeStep(ctx: StepContext<unknown>): Promise<StepContext<unknown>> {
      calls++
      return Promise.resolve({
        ...ctx,
        metadata: { ...ctx.metadata, invocationCount: calls },
      })
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Wrap the OpenAI Agent with cyberloop()
// ---------------------------------------------------------------------------

const wrapped = cyberloop<unknown>(
  {
    async run(input: string): Promise<AgentResult> {
      const result = await run(agent, input)
      return { output: result.finalOutput ?? '' }
    },
  },
  {
    budget: { maxSteps: 5 },
    middleware: [invocationTracker()],
    on: {
      beforeStep(ctx) {
        console.log(`  [CyberLoop] beforeStep — step=${ctx.step}`)
      },
      afterStep(ctx) {
        const count = ctx.metadata['invocationCount'] as number | undefined
        console.log(`  [CyberLoop] afterStep — invocations=${String(count ?? 0)}`)
      },
      onHalt(reason) {
        console.log(`\n⛔ [CyberLoop] Halted: ${reason}`)
      },
    },
  },
)

// ---------------------------------------------------------------------------
// 4. Parse CLI args and run
// ---------------------------------------------------------------------------

const program = new Command()
  .name('openai-agents-demo')
  .description('CyberLoop + OpenAI Agents SDK compatibility demo')
  .option('-q, --query <string>', 'Question to ask the agent', 'What is the speed of light and the distance to the moon?')
  .parse()

const cliOpts = program.opts<{ query: string }>()

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required. Set it in .env or environment.')
    process.exit(1)
  }

  console.log('🤖 OpenAI Agents SDK + CyberLoop Demo\n')
  console.log(`Query: "${cliOpts.query}"\n`)

  const result = await wrapped.run(cliOpts.query)

  console.log('\n' + '='.repeat(60))
  console.log(`✅ Output: ${result.output}`)
  console.log('='.repeat(60))
}

await main().catch(console.error)
