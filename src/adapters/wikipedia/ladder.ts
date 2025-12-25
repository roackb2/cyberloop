import { ProportionalLadder } from '../../core/ladder/proportional';

// Re-export or extend if needed. For now, the core proportional ladder is sufficient
// for the Wikipedia domain where feedback is a scalar similarity score.
export class WikiLadder extends ProportionalLadder {
  constructor() {
    super({ gainUp: 0.1, gainDown: 0.1, max: 1.0 });
  }
}
