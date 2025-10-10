import { Agent, run } from '@openai/agents'
import { z } from 'zod'

import type { Ladder, Policy } from '@/core/interfaces'

import type { GhAction, GhState } from './env'
import type { GitHubSearchApi } from './search-tool'
import { createGitHubSearchTool } from './search-tool'

const ProbeSchema = z.object({
  id: z.string(),
  pass: z.boolean(),
  reason: z.string().optional(),
  data: z.unknown().optional(),
})

const AgentInputSchema = z.object({
  query: z.string(),
  hits: z.number(),
  entropy: z.number(),
  lastProbe: ProbeSchema.optional(),
  probeHistory: z.array(ProbeSchema).max(10),
  items: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      labels: z.array(z.string()).optional(),
      stars: z.number().optional(),
    }),
  ).max(5),
  history: z
    .array(z.object({ query: z.string(), hits: z.number() }))
    .max(5)
    .optional(),
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
  readonly id = 'agent-query-policy'
  private readonly githubTool: ReturnType<typeof createGitHubSearchTool>

  constructor(private readonly api: GitHubSearchApi) {
    this.githubTool = createGitHubSearchTool(api)
  }

  capabilities() {
    return {
      explorationRange: [0, 3] as [number, number],
      cost: { step: 2 },
      handles: ['Unknown', 'TooBroad', 'TooNarrow', 'NoData'],
    }
  }

  async decide(state: GhState, ladder: Ladder<number>): Promise<GhAction> {
    // Determine mode based on ladder level AND probe failure signals
    let mode: GhAction['type'] = ladder.level() < 1 ? 'narrow' : ladder.level() > 2 ? 'broaden' : 'rephrase'
    
    // Override mode based on probe history signals (gradient-based adaptation)
    const recentProbes = (state.probes ?? []).slice(-3)
    const hasNoHitsFailures = recentProbes.some(p => !p.pass && (p.reason?.includes('no-hits') ?? p.reason?.includes('drop-to-zero')))
    const hasStuckAtZero = recentProbes.some(p => !p.pass && p.reason?.includes('stuck-at-zero'))
    
    // If we're stuck with no hits, force broaden mode
    if (hasStuckAtZero || (hasNoHitsFailures && state.hits === 0)) {
      mode = 'broaden'
    }
    
    const agent = new Agent<GhAction>({
      name: 'GitHubQueryAgent',
      instructions: buildInstructions(mode),
      tools: [this.githubTool],
    })

    const lastProbe = (state.probes ?? []).slice(-1)[0]
    const agentInput = AgentInputSchema.parse({
      query: state.query,
      hits: state.hits,
      entropy: state.entropy,
      lastProbe,
      probeHistory: state.probes ?? [],
      items: (state.items ?? []).slice(0, 5),
      history: state.history?.slice(-5),
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
You are assisting with GitHub repository search refinement using a control-theoretic approach.

**Context:**
- Input provides the current query, hit count, entropy, sample items, and probe history.
- The probe history shows deterministic checks (hasHits, entropyGuard, dropGuard) that act as canary signals.
- These probes help you quickly rule out or widen conditions, but YOU should explore multiple strategies.

**Your Task:**
- Use probe results as INTERNAL GRADIENT SIGNALS to guide your exploration.
- If probes failed (pass=false), their reasons indicate promising directions to adjust.
- You can make MULTIPLE tool calls to github_search to test hypotheses before deciding.
- The suggested mode is "${mode}", but you may deviate if probe signals suggest otherwise.

**Output Format:**
Return JSON with shape: { "type": "broaden"|"narrow"|"rephrase", "payload": { ... } }
- For broaden: { synonyms: string[] }
- For narrow: { exact: string[] }
- For rephrase: { pattern: string }

**Strategy:**
1. Analyze probe history to understand what failed and why
2. Test hypotheses with github_search tool calls if needed
3. Choose action that addresses root causes revealed by probes
4. Keep payload concise and actionable
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
