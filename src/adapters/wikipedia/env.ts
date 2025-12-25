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
    const isValidLink = (link: string) => !/^(File|Template|Help|Category|Wikipedia|Portal|Talk|Special):/i.test(link);

    if (action.type === 'CORRECTION') {
      logger.info(`[CyberLoop] 🛡️ Kinematic Intervention: Applied Correction Force: ${action.magnitude.toFixed(4)}`);

      // Backtracking Logic
      const history = this.currentState.history;
      const badTitle = this.currentState.currentTitle;
      const badLink = this.currentState.lastLinkClicked;

      // Build new blacklist: block both the resolved title AND the link text we clicked
      const newBlacklist = [...(this.currentState.blacklist || []), badTitle];
      if (badLink && badLink !== badTitle) {
        newBlacklist.push(badLink);
      }

      // If we have history, go back to previous
      if (history.length > 0) {
        let prevTitle: string | null = null;
        let newHistory: string[] = [];

        if (history.length >= 2) {
          prevTitle = history[history.length - 2];
          newHistory = history.slice(0, -1);
        } else {
          // history.length === 1, go back to start
          prevTitle = this.startTopic;
          newHistory = [];
        }

        if (prevTitle) {
          logger.info(`[CyberLoop] ↩️ Backtracking to: ${prevTitle} (Blacklisting: ${badTitle}${badLink ? ` & "${badLink}"` : ''})`);
          const data = await fetchWikiPage(prevTitle);
          if (data) {
            this.currentState = {
              ...this.currentState,
              ...data,
              currentTitle: data.currentTitle!,
              summary: data.summary!,
              url: data.url!,
              links: (data.links || []).filter(isValidLink),
              history: newHistory,
              depth: this.currentState.depth - 1,
              blacklist: newBlacklist,
              lastLinkClicked: undefined // Reset on backtrack? Or keep previous? Undefined seems safer to avoid confusion.
            };
            return this.currentState;
          }
        }
      }

      // Fallback if cannot backtrack: stay here but blacklist self (might force exploring other links if any)
      logger.info(`[CyberLoop] 🛑 Stopped drift. Staying at: ${this.currentState.currentTitle} (Blacklisting self)`);
      this.currentState = {
        ...this.currentState,
        blacklist: newBlacklist
      };
      return this.currentState;
    }

    if (action.type === 'NAVIGATE') {
      logger.info(`[CyberLoop] 🧭 Navigating to: ${action.title}`);
      const data = await fetchWikiPage(action.title);
      if (data) {
        this.currentState = {
          ...this.currentState,
          ...data,
          currentTitle: data.currentTitle!,
          summary: data.summary!,
          url: data.url!,
          links: (data.links || []).filter(isValidLink),
          history: [...this.currentState.history, data.currentTitle!], // Use resolved title in history
          depth: this.currentState.depth + 1,
          blacklist: this.currentState.blacklist || [],
          lastLinkClicked: action.title
        };
      } else {
        logger.error(`[WikipediaEnv] Failed to fetch ${action.title}, staying put.`);
      }
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
