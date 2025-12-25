import { logger } from './telemetry';
import type { WikiResponse, WikiState } from './types';

// Shared fetch logic
export async function fetchWikiPage(title: string): Promise<Partial<WikiState> | null> {
  try {
    const endpoint = 'https://en.wikipedia.org/w/api.php';
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'extracts|links',
      exintro: '1',
      explaintext: '1',
      pllimit: '500', // Max limit for non-bots
      titles: title,
      origin: '*'
    });

    const res = await fetch(`${endpoint}?${params.toString()}`);
    const data = await res.json() as WikiResponse;

    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (parseInt(pageId) < 0) {
      logger.warn(`[WikiAPI] Page not found or missing: ${title}`);
      return null;
    }

    return {
      currentTitle: page.title,
      summary: page.extract ?? '(No summary)',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      links: page.links?.map(l => l.title) ?? []
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[WikiAPI] Error fetching ${title}: ${msg}`);
    return null;
  }
}
