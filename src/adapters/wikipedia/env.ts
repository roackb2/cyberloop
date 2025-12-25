import type { Environment } from '../../core/interfaces';
import { fetchWikiPage } from './api';
import { logger } from './telemetry';
import type { WikiAction, WikiState } from './types';

export class WikipediaEnv implements Environment<WikiState, WikiAction> {
  public currentState: WikiState;

  constructor(
    private startTopic: string,
    private endTopic: string
  ) {
    this.currentState = {
      currentTitle: startTopic,
      summary: '',
      url: '',
      goal: endTopic,
      history: [],
      depth: 0,
      links: []
    };
  }

  async observe(): Promise<WikiState> {
    // Lazy fetch on first observation
    if (!this.currentState.summary) {
      await this.fetchPageData(this.currentState.currentTitle);
    }
    return this.currentState;
  }

  async apply(action: WikiAction): Promise<WikiState> {
    if (action.type === 'CORRECTION') {
      logger.info(`[CyberLoop] 🛡️ Kinematic Intervention: Applied Correction Force: ${action.magnitude.toFixed(4)}`);
      logger.info(`[CyberLoop] 🛑 Stopped drift. Staying at: ${this.currentState.currentTitle}`);

      // In a real scenario, we might blacklist the intended target if we knew it.
      // For this demo, we rely on the stochastic policy to pick a different path next time.
      return this.currentState;
    }

    if (action.type === 'NAVIGATE') {
      logger.info(`[CyberLoop] 🧭 Navigating to: ${action.title}`);
      await this.fetchPageData(action.title);
      this.currentState = {
        ...this.currentState,
        history: [...this.currentState.history, action.title],
        depth: this.currentState.depth + 1
      };
      return this.currentState;
    }

    if (action.type === 'DONE') {
      logger.info(`[CyberLoop] ✅ Goal Reached: ${action.result}`);
      return this.currentState;
    }

    return this.currentState;
  }

  private async fetchPageData(title: string) {
    const data = await fetchWikiPage(title);
    if (data) {
      this.currentState = {
        ...this.currentState,
        ...data,
        history: this.currentState.history,
        depth: this.currentState.depth,
        goal: this.currentState.goal
      };
    } else {
      logger.error(`[WikipediaEnv] No pages found or error fetching for title: ${title}`);
    }
  }
}
