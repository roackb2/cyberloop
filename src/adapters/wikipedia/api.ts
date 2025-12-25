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
      redirects: '1', // Auto-resolve redirects
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

    // Filter out technical namespaces locally to save embedding tokens and prevent traps
    const cleanLinks = (page.links?.map(l => l.title) ?? [])
      .filter(link => !/^(File|Template|Help|Category|Wikipedia|Portal|Talk|Special|Draft|User|MediaWiki):/i.test(link))
      // Filter out "H:" style shortcuts which are often Help redirects
      .filter(link => !/^[A-Z]+:[A-Z]+$/.test(link));

    return {
      currentTitle: page.title,
      summary: page.extract ?? '(No summary)',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      links: cleanLinks
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[WikiAPI] Error fetching ${title}: ${msg}`);
    return null;
  }
}
