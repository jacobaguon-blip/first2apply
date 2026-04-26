// Item 12 — Company enrichment for imported LinkedIn connections.
// Mock-first per spec §9.5: real fetcher is gated behind F2A_ENRICH_LIVE=1
// and is NOT exercised by tests or the dry-run.

import type { Connection } from './csv';

export type CompanyEnrichment = {
  linkedin_url: string | null;
  website_url: string | null;
};

export type EnrichmentSource = (company: string) => Promise<CompanyEnrichment | null>;

export type EnrichedConnection = Connection & {
  company_linkedin_url: string | null;
  company_website_url: string | null;
};

export function makeFixtureSource(table: Record<string, CompanyEnrichment>): EnrichmentSource {
  return async (company: string) => table[company] ?? null;
}

/**
 * Live source — DuckDuckGo HTML scraping (no API key, no auth).
 * Disabled unless F2A_ENRICH_LIVE=1.  Kept tiny + side-effect-only at edges.
 */
export function makeLiveSource(opts: {
  fetchImpl?: typeof fetch;
  enabled?: boolean;
} = {}): EnrichmentSource {
  const enabled = opts.enabled ?? process.env.F2A_ENRICH_LIVE === '1';
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (company: string) => {
    if (!enabled) return null;
    try {
      const q = encodeURIComponent(`"${company}" linkedin company page`);
      const res = await fetchImpl(`https://duckduckgo.com/html/?q=${q}`);
      const html = await res.text();
      const linkedin = /https:\/\/[a-z]+\.linkedin\.com\/company\/[A-Za-z0-9_-]+/i.exec(html)?.[0] ?? null;
      const website = /https:\/\/(?!\w*linkedin\.)[\w.-]+\.[a-z]{2,}/i.exec(html)?.[0] ?? null;
      return { linkedin_url: linkedin, website_url: website };
    } catch {
      return null;
    }
  };
}

export async function enrichConnections(
  connections: Connection[],
  source: EnrichmentSource,
): Promise<EnrichedConnection[]> {
  const cache = new Map<string, CompanyEnrichment | null>();
  const out: EnrichedConnection[] = [];
  for (const c of connections) {
    const key = c.company;
    if (!cache.has(key)) cache.set(key, await source(key));
    const e = cache.get(key) ?? null;
    out.push({
      ...c,
      company_linkedin_url: e?.linkedin_url ?? null,
      company_website_url: e?.website_url ?? null,
    });
  }
  return out;
}
