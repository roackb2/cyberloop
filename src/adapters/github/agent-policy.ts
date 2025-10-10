import { Agent, run } from '@openai/agents'
import { z } from 'zod'

import type { Ladder, Policy } from '@/core/interfaces'

import type { GhAction, GhState } from './env'
import type { GitHubSearchApi } from './search-tool'
import { createGitHubSearchTool } from './search-tool'

const AgentInputSchema = z.object({
  query: z.string(),
  hits: z.number(),
  entropy: z.number(),
  items: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      labels: z.array(z.string()).optional(),
      stars: z.number().optional(),
    }),
  ).max(5),
  suggested_mode: z.enum(['broaden', 'narrow', 'rephrase']),
})

const ActionSchema = z.object({
  type: z.enum(['broaden', 'narrow', 'rephrase']).optional(),
  payload: z.object({
    synonyms: z.array(z.string()).max(5).optional(),
    exact: z.array(z.string()).max(5).optional(),
    pattern: z.string().max(140).optional(),
  }).partial().optional(),
})

export class AgentQueryPolicy implements Policy<GhState, GhAction, number> {
  public readonly id = 'agent-query-policy'

  private readonly githubTool

  constructor(api: GitHubSearchApi) {
    const toolInstance = createGitHubSearchTool(api)
    this.githubTool = toolInstance
  }

  capabilities() {
    return {
      explorationRange: [0, 3] as [number, number],
      cost: { step: 2 },
      handles: ['Unknown', 'TooBroad', 'TooNarrow', 'NoData'],
    }
  }

  async decide(state: GhState, ladder: Ladder<number>): Promise<GhAction> {
    const mode = ladder.level() < 1 ? 'narrow' : ladder.level() > 2 ? 'broaden' : 'rephrase'
    const agent = new Agent<GhAction>({
      name: 'GitHubQueryAgent',
      instructions: buildInstructions(mode),
      tools: [this.githubTool],
    })

    const agentInput = AgentInputSchema.parse({
      query: state.query,
      hits: state.hits,
      entropy: state.entropy,
      items: (state.items ?? []).slice(0, 5),
      suggested_mode: mode,
    })

    const runResult = await run(agent, JSON.stringify(agentInput))

    return normalizeAction(runResult.finalOutput, mode)
  }

  adapt(_feedback: number, _ladder: Ladder<number>): void {
    // no-op adaptation for now
  }
}

function buildInstructions(mode: GhAction['type']): string {
  return `
You are assisting with GitHub repository search refinement.
- Input provides the current query, hit count, entropy, and sample items.
- Decide the next action to improve relevance while respecting the suggested mode (${mode}).
- You may call the tool "github_search" if needed, but return only JSON with shape:
  { "type": "broaden"|"narrow"|"rephrase", "payload": { ... } }
- Keep payload concise: synonyms (string[]), exact (string[]), or pattern (string).
- Do not include extra fields or commentary.
  `.trim()
}

function normalizeAction(output: unknown, fallback: GhAction['type']): GhAction {
  const raw = typeof output === 'string' ? safeParse(output) : output
  if (raw && typeof raw === 'object') {
    const parsed = ActionSchema.safeParse(raw)
    if (parsed.success) {
      return buildAction(parsed.data, fallback)
    }
  }
  return { type: fallback, payload: {} }
}

function buildAction(parsed: z.infer<typeof ActionSchema>, fallback: GhAction['type']): GhAction {
  const type = parsed.type ?? fallback
  const payload = parsed.payload
  if (type === 'broaden') {
    return payload?.synonyms?.length
      ? { type: 'broaden', payload: { synonyms: payload.synonyms } }
      : { type: 'broaden' }
  }
  if (type === 'narrow') {
    return payload?.exact?.length
      ? { type: 'narrow', payload: { exact: payload.exact } }
      : { type: 'narrow' }
  }
  if (payload?.pattern) {
    return { type: 'rephrase', payload: { pattern: payload.pattern } }
  }
  return { type: 'rephrase' }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
