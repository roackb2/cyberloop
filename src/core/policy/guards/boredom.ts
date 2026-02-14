import type { Logger } from '../../interfaces';
import type { PolicyGuard } from '../chain';

interface StateWithHistory {
  history: string[];
  links: string[];
  candidateWeights?: Record<string, number>;
}

export class BoredomGuard<S extends StateWithHistory> implements PolicyGuard<S> {
  public name = 'boredom-guard';

  constructor(private logger?: Logger) { }

  private stopWords = new Set([
    'the', 'of', 'in', 'and', 'a', 'an', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
    'is', 'are', 'was', 'were', 'it', 'that', 'this', 'list',
    // Domain specific handled via configuration? For now hardcoded as per request
    'france', 'french'
  ]);

  apply(state: S): S {
    if (!state.history || state.history.length === 0) {
      return state;
    }

    // 1. Calculate History Word Frequencies
    const historyCounts = new Map<string, number>();
    for (const title of state.history) {
      const words = this.tokenize(title);
      for (const w of words) {
        historyCounts.set(w, (historyCounts.get(w) ?? 0) + 1);
      }
    }

    // 2. Calculate Weights for Candidates
    const weights: Record<string, number> = { ...(state.candidateWeights ?? {}) };
    let hasUpdates = false;

    for (const link of state.links) {
      let boredomPenalty = 0;
      const words = this.tokenize(link);

      for (const w of words) {
        const count = historyCounts.get(w) ?? 0;
        // If a word appears more than 2 times in history, start penalizing
        if (count > 2) {
          boredomPenalty += 0.1 * (count - 2);
        }
      }

      if (boredomPenalty > 0) {
        // Multiplier: 1.0 means no penalty, < 1.0 means penalty
        // Current weight defaults to 1.0 if not set
        const currentWeight = weights[link] ?? 1.0;
        // Apply penalty multiplier (clamped to 0.1)
        const penaltyMultiplier = Math.max(0.1, 1.0 - boredomPenalty);

        weights[link] = currentWeight * penaltyMultiplier;
        hasUpdates = true;

        this.logger?.info(`[BoredomGuard] 📉 Penalizing '${link}': penalty=${boredomPenalty.toFixed(2)}, newWeight=${penaltyMultiplier.toFixed(2)}`);
      }
    }

    if (!hasUpdates) {
      return state;
    }

    return {
      ...state,
      candidateWeights: weights
    };
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.has(w));
  }
}
