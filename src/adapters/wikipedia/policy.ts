import type { Ladder, ProbePolicy } from '../../core/interfaces';
import { dot, norm } from '../../core/kinematics/math';
import type { WikipediaEmbedder } from './embedder';
import { logger } from './telemetry';
import type { WikiAction, WikiState } from './types';

export class GreedyWikiPolicy implements ProbePolicy<WikiState, WikiAction, number> {
  public id = 'greedy-wiki-policy';

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
      logger.warn("[GreedyWikiPolicy] Dead end! No links found.");
      return { type: 'DONE', result: "Dead End" };
      // Real implementation would backtrack, but let's stop for demo.
    }

    // 1. Filter links (Optimization: limit to first 20 or random subset to save embedding costs)
    // Filter out meta-namespaces AND blacklist AND visited
    const blacklist = new Set(state.blacklist || []);
    const history = new Set(state.history || []);

    const validLinks = state.links.filter(link =>
      !link.startsWith('Wikipedia:') &&
      !link.startsWith('Template:') &&
      !link.startsWith('Category:') &&
      !link.startsWith('Help:') &&
      !link.startsWith('Portal:') &&
      !link.startsWith('Talk:') &&
      !link.startsWith('Special:') &&
      !link.startsWith('File:') &&
      !blacklist.has(link) &&
      !history.has(link)
    );

    if (validLinks.length === 0) {
      logger.warn("[GreedyWikiPolicy] Dead end after filtering! No valid links found.");
      return { type: 'DONE', result: "Dead End (Filtered)" };
    }

    // For demo, let's take a random sample of 10 links + 5 likely ones?
    // Or just first 15.
    const candidates = validLinks.slice(0, 50);

    logger.debug(`[GreedyWikiPolicy] Evaluating ${candidates.length} candidates...`);

    // 2. Embed candidates
    const embeddings = await this.embedder.embedBatch(candidates);

    // 3. Rank by similarity to GOAL
    // We want the link that is semantically closest to the GOAL.
    // Goal embedding is passed in constructor.

    const scores = candidates.map((link, i) => {
      const emb = embeddings[i];
      // Cosine similarity
      const sim = dot(emb, this.goalEmbedding) / (norm(emb) * norm(this.goalEmbedding));
      return { link, sim };
    });

    // Sort descending
    scores.sort((a, b) => b.sim - a.sim);

    // 4. Select Top-1 (Greedy)
    // To allow some variation if we get stuck (corrected),
    // maybe we add slight noise or pick from Top-3?
    // Let's stick to Greedy Top-1 first.
    // If kinematics blocks it, the orchestrator/env loop will effectively retry.
    // Wait, if we are deterministic, we will retry the SAME link.
    // We need some stochasticity.

    // Stochastic Top-3
    const top3 = scores.slice(0, 3);
    const selected = top3[Math.floor(Math.random() * top3.length)];

    logger.info(`[GreedyWikiPolicy] Selected: ${selected.link} (Sim: ${selected.sim.toFixed(4)})`);

    return { type: 'NAVIGATE', title: selected.link };
  }
}
