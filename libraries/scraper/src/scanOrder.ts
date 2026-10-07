import { Link, SiteProvider } from '@first2apply/core';

type SiteLike = { id: number; provider?: string };

/**
 * Orders links so fast, deterministic parsers (LinkedIn, Indeed, ...) run before
 * custom boards, which go through a slow LLM parse (minutes per link on a CPU-only
 * Ollama). The scan queue is serialized, so without this a pile of custom links
 * starves everything else. The sort is stable: relative order inside each group is kept.
 */
export function prioritizeLinks(links: Link[], sites: SiteLike[]): Link[] {
  const customSiteIds = new Set(sites.filter((site) => site.provider === SiteProvider.custom).map((site) => site.id));
  const rank = (link: Link) => (customSiteIds.has(link.site_id) ? 1 : 0);
  return links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => rank(a.link) - rank(b.link) || a.index - b.index)
    .map(({ link }) => link);
}
