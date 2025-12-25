import type { PolicyGuard } from '../chain';

interface StateWithBlacklist {
  links: string[];
  blacklist?: string[];
}

export class BlacklistGuard<S extends StateWithBlacklist> implements PolicyGuard<S> {
  public name = 'blacklist-guard';

  apply(state: S): S {
    if (!state.blacklist || state.blacklist.length === 0) {
      return state;
    }

    const blacklist = new Set(state.blacklist);
    // Filter out blacklisted links
    const filteredLinks = state.links.filter(link => !blacklist.has(link));

    return {
      ...state,
      links: filteredLinks
    };
  }
}
