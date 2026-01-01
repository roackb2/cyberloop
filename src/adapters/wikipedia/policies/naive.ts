import type { Ladder, ProbePolicy } from '../../../core/interfaces';
import { dot, norm } from '../../../core/kinematics/math';
import type { WikipediaEmbedder } from '../embedder';
import { logger } from '../telemetry';
import type { WikiAction, WikiState } from '../types';

export class NaiveGreedyPolicy implements ProbePolicy<WikiState, WikiAction, number> {
  public id = 'naive-greedy-policy';

  constructor(
    private embedder: WikipediaEmbedder,
    private goalEmbedding: number[]
  ) { }

  initialize(_state: WikiState): void {
    // No-op for greedy policy
  }

  isStable(state: WikiState): boolean {
    return state.currentTitle === state.goal;
  }

  async decide(state: WikiState, _ladder: Ladder<number>): Promise<WikiAction> {
    if (state.currentTitle === state.goal) {
      return { type: 'DONE', result: "Arrived at Goal!" };
    }

    if (!state.links || state.links.length === 0) {
      logger.warn("[NaiveGreedyPolicy] Dead end! No links found.");
      return { type: 'DONE', result: "Dead End" };
    }

    // Filter out meta-namespaces
    const basicValidLinks = state.links.filter(link =>
      !link.startsWith('Wikipedia:') &&
      !link.startsWith('Template:') &&
      !link.startsWith('Category:') &&
      !link.startsWith('Help:') &&
      !link.startsWith('Portal:') &&
      !link.startsWith('Talk:') &&
      !link.startsWith('Special:') &&
      !link.startsWith('File:')
    );

    if (basicValidLinks.length === 0) {
      logger.warn("[NaiveGreedyPolicy] Dead end after basic filtering! No valid links found.");
      return { type: 'DONE', result: "Dead End (Filtered)" };
    }

    // Optimization: Take first 50 links (or random sample) to evaluate
    const candidates = basicValidLinks.slice(0, 50);

    logger.debug(`[NaiveGreedyPolicy] Evaluating ${candidates.length} candidates...`);

    // 2. Embed candidates
    const embeddings = await this.embedder.embedBatch(candidates);

    // 3. Rank by similarity to GOAL
    const scores = candidates.map((link, i) => {
      const emb = embeddings[i];
      // Cosine similarity
      const rawSim = dot(emb, this.goalEmbedding) / (norm(emb) * norm(this.goalEmbedding));

      // Apply weights if present (from guards)
      const weight = state.candidateWeights?.[link] ?? 1.0;
      const sim = rawSim * weight;

      return { link, sim, rawSim, weight };
    });

    // Sort descending
    scores.sort((a, b) => b.sim - a.sim);

    // 4. Select Top-1 (Greedy) or Stochastic Top-3
    // For pure "Dumb Muscle" greedy, we strictly take Top-1
    const selected = scores[0];

    logger.info(`[NaiveGreedyPolicy] Selected: ${selected.link} (Score: ${selected.sim.toFixed(4)})`);

    return { type: 'NAVIGATE', title: selected.link };
  }
}
