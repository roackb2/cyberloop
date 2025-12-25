import type { WikipediaEmbedder } from '../../../adapters/wikipedia/embedder';
import { logger } from '../../../adapters/wikipedia/telemetry';
import type { WikiAction, WikiState } from '../../../adapters/wikipedia/types';
import { dot, norm } from '../../kinematics/math';
import type { PolicyReflex } from '../chain';

export class SoftLandingReflex implements PolicyReflex<WikiState, WikiAction> {
  public name = 'soft-landing';

  constructor(
    private embedder: WikipediaEmbedder,
    private goalEmbedding: number[],
    private threshold = 0.85
  ) { }

  async check(state: WikiState): Promise<WikiAction | null> {
    try {
      // Note: This may incur redundant embedding cost if not cached
      const currentVec = await this.embedder.embed(state);
      const sim = dot(currentVec, this.goalEmbedding) / (norm(currentVec) * norm(this.goalEmbedding));

      if (sim > this.threshold) {
        logger.info(`[Reflex] 🛬 Soft Landing triggered! Similarity ${sim.toFixed(4)} > ${this.threshold}`);
        return { type: 'DONE', result: "Semantic Match Reached" };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Reflex] Soft landing check failed: ${errMsg}`);
    }
    return null;
  }
}
