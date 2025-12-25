import type { Evaluator } from '../../core/interfaces';
import { dot, norm } from '../../core/kinematics/math';
import type { WikipediaEmbedder } from './embedder';
import { logger } from './telemetry';
import type { WikiState } from './types';

export class WikipediaEvaluator implements Evaluator<WikiState, number> {
  private goalEmbedding: number[] | null = null;

  constructor(private embedder: WikipediaEmbedder) { }

  async evaluate(prev: WikiState, next: WikiState): Promise<number> {
    // 1. Ensure we have the goal embedding
    if (!this.goalEmbedding) {
      // We assume next.goal is consistent
      // Note: In a cleaner design, we might pass goalEmbedding in constructor or cache it better
      const embeddings = await this.embedder.embedBatch([next.goal]);
      this.goalEmbedding = embeddings[0];
    }

    if (!this.goalEmbedding) return 0;

    // 2. Embed prev and next titles/summaries
    // Optimization: The embedder might cache these or we assume Env populated them?
    // Env populate summary, but maybe not full embedding for evaluation?
    // The Policy embeds links, but here we evaluate the State transition.

    // We need embeddings of the STATES (content).
    // Let's re-embed to be safe (or assume policy did it? No, policy does candidates).

    const [prevEmb, nextEmb] = await this.embedder.embedBatch([
      `Topic: ${prev.currentTitle}\n${prev.summary.slice(0, 200)}`,
      `Topic: ${next.currentTitle}\n${next.summary.slice(0, 200)}`
    ]);

    // 3. Calculate Sim(Prev, Goal) and Sim(Next, Goal)
    const scorePrev = this.similarity(prevEmb, this.goalEmbedding);
    const scoreNext = this.similarity(nextEmb, this.goalEmbedding);

    // 4. Feedback = Delta
    const delta = scoreNext - scorePrev;

    logger.debug(`[Evaluator] Delta: ${delta.toFixed(4)} (Prev: ${scorePrev.toFixed(4)} -> Next: ${scoreNext.toFixed(4)})`);

    // Scale it up a bit for the ladder?
    return delta * 10;
  }

  private similarity(a: number[], b: number[]): number {
    return dot(a, b) / (norm(a) * norm(b));
  }
}
