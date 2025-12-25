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
    const blacklist = new Set(state.blacklist ?? []);
    const history = new Set(state.history ?? []);

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

    // 1.b Calculate Boredom Context (Word Frequencies in History)
    const STOPWORDS = new Set([
      'the', 'of', 'in', 'and', 'a', 'an', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
      'france', 'french', // Domain specific stop words to avoid penalizing the goal context too much
      'is', 'are', 'was', 'were', 'it', 'that', 'this', 'list' // Common noise
    ]);

    const tokenize = (text: string): string[] => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
    };

    const historyCounts = new Map<string, number>();
    for (const title of state.history ?? []) {
      const words = tokenize(title);
      for (const w of words) {
        historyCounts.set(w, (historyCounts.get(w) ?? 0) + 1);
      }
    }

    // For demo, let's take a random sample of 50 links
    const candidates = validLinks.slice(0, 50);

    logger.debug(`[GreedyWikiPolicy] Evaluating ${candidates.length} candidates...`);

    // 2. Embed candidates
    const embeddings = await this.embedder.embedBatch(candidates);

    // 3. Rank by similarity to GOAL (with Boredom Penalty)
    const scores = candidates.map((link, i) => {
      const emb = embeddings[i];
      // Cosine similarity
      const sim = dot(emb, this.goalEmbedding) / (norm(emb) * norm(this.goalEmbedding));

      // Calculate Boredom Penalty
      let boredomPenalty = 0;
      const words = tokenize(link);
      for (const w of words) {
        const count = historyCounts.get(w) ?? 0;
        // If a word appears more than 2 times in history, start penalizing
        if (count > 2) {
          boredomPenalty += 0.1 * (count - 2);
        }
      }

      // Clamp multiplier to be at least 0.1 to avoid negative or zero scores
      const penaltyMultiplier = Math.max(0.1, 1.0 - boredomPenalty);
      const finalScore = sim * penaltyMultiplier;

      return { link, sim: finalScore, rawSim: sim, penalty: boredomPenalty };
    });

    // Sort descending
    scores.sort((a, b) => b.sim - a.sim);

    // 4. Select Top-1 (Greedy) or Stochastic Top-3
    const top3 = scores.slice(0, 3);
    const selected = top3[Math.floor(Math.random() * top3.length)];

    logger.info(`[GreedyWikiPolicy] Selected: ${selected.link} (Score: ${selected.sim.toFixed(4)}, Raw: ${selected.rawSim.toFixed(4)}, Penalty: ${selected.penalty.toFixed(2)})`);

    return { type: 'NAVIGATE', title: selected.link };
  }
}
