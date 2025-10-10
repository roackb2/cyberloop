import type { Policy, Probe, StrategySelector } from '@/core/interfaces'
import type { FailureType } from '@/core/types'

import type { GhAction, GhState } from './env'

const failurePreferredPolicy: Record<FailureType, GhAction['type']> = {
  Unknown: 'rephrase',
  NoData: 'broaden',
  TooNarrow: 'rephrase',
  TooBroad: 'narrow',
  AuthDenied: 'rephrase',
  RateLimited: 'rephrase',
  ToolMissing: 'rephrase',
  Infeasible: 'rephrase',
}

export class SearchFailureSelector
  implements StrategySelector<GhState, GhAction>
{
  constructor(private readonly opts: { preferLlm?: boolean } = {}) { }

  select(input: {
    failure: FailureType
    ladderLevel: number
    budgetRemaining: number
    probes: Probe<GhState>[]
    policies: Policy<GhState, GhAction>[]
  }): { probe: Probe<GhState>; policy: Policy<GhState, GhAction> } {
    const { failure, ladderLevel, probes, policies } = input

    const probe = pickProbe(probes, failure)
    const policy = pickPolicy(policies, failure, ladderLevel, this.opts)

    return { probe, policy }
  }
}

function pickProbe(probes: Probe<GhState>[], failure: FailureType): Probe<GhState> {
  const sorted = [...probes].sort(
    (a, b) => (a.capabilities?.()?.cost ?? 0) - (b.capabilities?.()?.cost ?? 0),
  )
  return (
    sorted.find(p => p.capabilities?.()?.supports?.includes(failure)) ?? sorted[0]
  )
}

function pickPolicy(
  policies: Policy<GhState, GhAction>[],
  failure: FailureType,
  ladderLevel: number,
  opts: { preferLlm?: boolean },
): Policy<GhState, GhAction> {
  const inWindow = policies.filter(p => {
    const [min, max] = p.capabilities?.()?.explorationRange ?? [0, Infinity]
    return ladderLevel >= min && ladderLevel <= max
  })
  const viable = (inWindow.length ? inWindow : policies).sort(
    (a, b) => (a.capabilities?.()?.cost?.step ?? 1) - (b.capabilities?.()?.cost?.step ?? 1),
  )
  const target = failurePreferredPolicy[failure] ?? 'rephrase'
  if (opts.preferLlm && failure !== 'NoData') {
    const llmPolicy = viable.find(p => /llm|agent/i.test(p.id))
    if (llmPolicy) return llmPolicy
  }
  const handled = viable.filter(p => p.capabilities?.()?.handles?.includes(failure))
  if (handled.length) return handled[0]
  const matchingId = viable.find(p => p.id.includes(target))
  if (matchingId) return matchingId
  return viable[0]
}
