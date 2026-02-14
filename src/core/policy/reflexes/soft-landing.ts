import type { Logger } from '../../interfaces';
import type { StateEmbedder } from '../../kinematics/interfaces';
import { dot, norm } from '../../kinematics/math';
import type { PolicyReflex } from '../chain';

export interface SoftLandingOpts<S, A> {
  embedder: StateEmbedder<S>;
  goalEmbedding: number[];
  /** Create the action to return when semantic match is reached */
  createDoneAction(reason: string): A;
  threshold?: number;
  logger?: Logger;
}

export class SoftLandingReflex<S, A> implements PolicyReflex<S, A> {
  public name = 'soft-landing';

  private readonly threshold: number;

  constructor(private opts: SoftLandingOpts<S, A>) {
    this.threshold = opts.threshold ?? 0.85;
  }

  async check(state: S): Promise<A | null> {
    try {
      // Note: This may incur redundant embedding cost if not cached
      const currentVec = await this.opts.embedder.embed(state);
      const sim = dot(currentVec, this.opts.goalEmbedding) / (norm(currentVec) * norm(this.opts.goalEmbedding));

      if (sim > this.threshold) {
        this.opts.logger?.info(`[Reflex] 🛬 Soft Landing triggered! Similarity ${sim.toFixed(4)} > ${this.threshold}`);
        return this.opts.createDoneAction("Semantic Match Reached");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.opts.logger?.warn(`[Reflex] Soft landing check failed: ${errMsg}`);
    }
    return null;
  }
}
