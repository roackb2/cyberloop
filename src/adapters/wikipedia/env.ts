import type { Environment } from '../../core/interfaces';
import { logger } from './telemetry';
import type { WikiAction, WikiState } from './types';

interface WikiResponse {
  query?: {
    pages?: Record<string, {
      title: string;
      extract?: string;
      links?: { title: string }[];
    }>
  }
}

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
    try {
      const endpoint = 'https://en.wikipedia.org/w/api.php';
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'extracts|links',
        exintro: '1',
        explaintext: '1',
        pllimit: '500',
        titles: title,
        origin: '*'
      });

      const res = await fetch(`${endpoint}?${params.toString()}`);
      const data = await res.json() as WikiResponse;

      const pages = data.query?.pages;
      if (!pages) {
        logger.error(`[WikipediaEnv] No pages found for title: ${title}`);
        return;
      }

      const pageId = Object.keys(pages)[0];
      const page = pages[pageId];

      this.currentState = {
        ...this.currentState,
        currentTitle: page.title,
        summary: page.extract ?? '(No summary)',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        links: page.links?.map(l => l.title) ?? []
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[WikipediaEnv] Error fetching data for ${title}: ${msg}`);
    }
  }
}
