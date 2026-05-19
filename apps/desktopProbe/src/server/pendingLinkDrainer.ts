// Drains the `pending_links` table (rows queued from the iOS Share Sheet)
// by opening each URL in the existing HtmlDownloader and routing through
// the normal createLink flow. Self-healing: reaps stuck 'claimed' rows.
//
// Auto-discovery: when the shared URL doesn't look like a careers/jobs
// page, the drainer parses the HTML for a Careers/Jobs link in the nav
// or footer and follows it once before calling createLink.

import { F2aSupabaseApi } from '@first2apply/ui';
import { getExceptionMessage } from '@first2apply/core';
import { CAREERS_HOST_HINTS, looksLikeCareersUrl } from '../lib/careersUrl';
import { HtmlDownloader } from './htmlDownloader';
import { ILogger } from './logger';

type PendingRow = {
  id: number;
  user_id: string;
  url: string;
  title: string | null;
  status: 'pending' | 'claimed' | 'failed';
  attempts: number;
};

const STUCK_CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const DRAIN_BATCH = 5;

// Anchor text tokens for auto-discovery on company front pages.
const CAREERS_ANCHOR_TEXT = ['careers', 'career', 'jobs', 'open positions', 'open roles', 'work with us', 'join us', 'we’re hiring', 'we are hiring', 'hiring'];

/**
 * Decode a DuckDuckGo result href. Some look like `//duckduckgo.com/l/?uddg=...`
 * with the real URL in the `uddg` query param; others are direct URLs.
 */
function decodeDuckDuckGoHref(href: string): string | null {
  if (!href) return null;
  try {
    let full = href.startsWith('//') ? 'https:' + href : href;
    if (!/^https?:\/\//i.test(full)) return null;
    const u = new URL(full);
    if (u.hostname.includes('duckduckgo.com') && u.searchParams.has('uddg')) {
      return u.searchParams.get('uddg');
    }
    return full;
  } catch {
    return null;
  }
}

/**
 * Parse the DuckDuckGo HTML SERP for the first result that lives on the
 * target hostname (or any subdomain of it). Returns absolute URL or null.
 */
function pickResultMatchingHost(html: string, targetHostname: string): string | null {
  const target = targetHostname.replace(/^www\./, '').toLowerCase();
  const re = /<a\b[^>]*\b(?:class\s*=\s*["'](?:result__a|result__url)["']|href\s*=\s*["'])[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const resolved = decodeDuckDuckGoHref(match[1]);
    if (!resolved) continue;
    try {
      const u = new URL(resolved);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const hostMatches = host === target || host.endsWith('.' + target);
      // Require the result URL to actually look like a careers page — otherwise
      // a `site:example.com careers` query just returns example.com's homepage.
      if (hostMatches && looksLikeCareersUrl(resolved)) {
        return resolved;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// CTA anchor text for the 2nd-hop "the real jobs live elsewhere" discovery.
const JOBS_CTA_TEXT = [
  'view open positions',
  'see all jobs',
  'see open jobs',
  'browse jobs',
  'all openings',
  'current openings',
  'open positions',
  'open roles',
  'view all openings',
  'view all jobs',
  'search positions',
  'search jobs',
  'apply now',
];

/**
 * Given the HTML of a careers landing page, look for an outbound link to an
 * ATS (Paylocity, Greenhouse, Workday, etc.) or a "View open positions"-style
 * CTA pointing to a deeper job-list URL. Returns the URL to follow next, or
 * null if the current page is already the real job list.
 */
function discoverJobsListUrl(html: string, baseUrl: string): string | null {
  // Iframes first — many companies embed their ATS via iframe.
  const iframeRe = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let im: RegExpExecArray | null;
  while ((im = iframeRe.exec(html)) !== null) {
    try {
      const absolute = new URL(im[1], baseUrl).toString();
      const host = new URL(absolute).hostname.toLowerCase();
      if (CAREERS_HOST_HINTS.some((h) => host === h || host.endsWith('.' + h))) {
        return absolute;
      }
    } catch {
      /* skip */
    }
  }

  // Anchors with scoring.
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates: Array<{ url: string; score: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const rawText = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const text = rawText.toLowerCase();
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;

    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }

    let score = 0;
    // ATS host = strongest signal.
    if (CAREERS_HOST_HINTS.some((h) => host === h || host.endsWith('.' + h))) score += 200;
    // CTA text.
    for (const tok of JOBS_CTA_TEXT) {
      if (text === tok) score += 80;
      else if (text.includes(tok)) score += 50;
    }
    // Path looks job-list-y AND text suggests an action.
    if (looksLikeCareersUrl(url) && /position|opening|role|job/.test(text)) score += 40;

    if (score >= 80) candidates.push({ url, score, text: rawText });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

/**
 * Scan the captured HTML of a company front page for an anchor that points
 * at the careers/jobs page. Returns an absolute URL or null if nothing found.
 */
function discoverCareersUrl(html: string, baseUrl: string): string | null {
  // Find every <a ... href="..." ...>text</a>
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates: Array<{ href: string; text: string; score: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    const rawText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const text = rawText.toLowerCase();
    if (!href) continue;

    let score = 0;
    for (const tok of CAREERS_ANCHOR_TEXT) {
      if (text === tok) score += 100;
      else if (text.includes(tok)) score += 50;
    }
    if (looksLikeCareersUrl(href)) score += 30;
    if (score > 0) candidates.push({ href, text: rawText, score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  try {
    return new URL(winner.href, baseUrl).toString();
  } catch {
    return null;
  }
}

export class PendingLinkDrainer {
  private _draining = false;

  constructor(
    private readonly logger: ILogger,
    private readonly supabaseApi: F2aSupabaseApi,
    private readonly normalHtmlDownloader: HtmlDownloader,
    private readonly notifyAggregated: (failures: number) => void,
  ) {}

  /** Safe to call frequently; concurrent invocations short-circuit. */
  async drain(): Promise<void> {
    if (this._draining) return;
    this._draining = true;
    let terminalFailures = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = this.supabaseApi.getSupabaseClient() as any;
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        this.logger.info('drain: no logged-in user, skipping');
        return;
      }

      // 0. Reap stuck 'claimed' rows
      const stuckCutoff = new Date(Date.now() - STUCK_CLAIM_MINUTES * 60 * 1000).toISOString();
      await supabase
        .from('pending_links')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('user_id', user.user.id)
        .eq('status', 'claimed')
        .lt('updated_at', stuckCutoff);

      // 1. Find candidates
      const { data: candidates, error: candErr } = await supabase
        .from('pending_links')
        .select('id, user_id, url, title, status, attempts')
        .eq('user_id', user.user.id)
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(DRAIN_BATCH);
      if (candErr) throw candErr;
      if (!candidates?.length) return;

      this.logger.info(`drain: ${candidates.length} pending row(s) to process`);

      for (const cand of candidates as PendingRow[]) {
        // 2. Atomic claim
        const { data: claimed, error: claimErr } = await supabase
          .from('pending_links')
          .update({
            status: 'claimed',
            attempts: cand.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cand.id)
          .eq('status', 'pending')
          .select('*')
          .maybeSingle();
        if (claimErr) {
          this.logger.error(`claim failed for ${cand.id}: ${claimErr.message}`);
          continue;
        }
        if (!claimed) continue;

        const row = claimed as PendingRow;
        const isTerminal = row.attempts >= MAX_ATTEMPTS;

        try {
          const result = await this.processOne(row);
          await supabase
            .from('pending_links')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              link_id: typeof result.linkId === 'number' ? result.linkId : null,
              url: result.finalUrl,
              title: row.title,
              error_message: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          this.logger.info(
            `pending_link ${row.id} drained successfully — final url=${result.finalUrl} link_id=${result.linkId} discovered=${result.discovered}`,
          );
        } catch (e) {
          const fullMsg = getExceptionMessage(e);
          const msg = fullMsg.split('\n')[0].replace(/^Error:\s*/, '');
          this.logger.error(`pending_link ${row.id} drain failed (attempt ${row.attempts}): ${fullMsg}`);

          if (isTerminal) {
            terminalFailures += 1;
            await supabase
              .from('pending_links')
              .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
              .eq('id', row.id);
          } else {
            await supabase
              .from('pending_links')
              .update({ status: 'pending', error_message: msg, updated_at: new Date().toISOString() })
              .eq('id', row.id);
          }
        }
      }
    } catch (e) {
      this.logger.error(`drain cycle failed: ${getExceptionMessage(e)}`);
    } finally {
      this._draining = false;
      if (terminalFailures > 0) this.notifyAggregated(terminalFailures);
    }
  }

  private async processOne(row: PendingRow): Promise<{ finalUrl: string; linkId: number | string; discovered: boolean }> {
    const sharedUrl = row.url;
    const shouldDiscover = !looksLikeCareersUrl(sharedUrl);

    let urlToUse = sharedUrl;
    let discovered = false;

    if (shouldDiscover) {
      this.logger.info(`pending_link ${row.id}: ${sharedUrl} doesn't look like a careers page, attempting auto-discovery`);
      let found: string | null = null;
      try {
        found = await this.normalHtmlDownloader.loadUrl({
          url: sharedUrl,
          callback: async ({ html }) => discoverCareersUrl(html, sharedUrl),
        });
      } catch (e) {
        this.logger.error(`pending_link ${row.id}: discovery load failed: ${getExceptionMessage(e)}`);
        throw new Error(`Couldn't load ${sharedUrl} to look for a careers page: ${getExceptionMessage(e)}`);
      }

      if (found && found !== sharedUrl) {
        this.logger.info(`pending_link ${row.id}: discovered careers page → ${found}`);
        urlToUse = found;
        discovered = true;
      } else {
        // Anchor-scan failed → fall back to DuckDuckGo HTML search.
        const host = (() => { try { return new URL(sharedUrl).hostname; } catch { return sharedUrl; } })();
        const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent('site:' + host.replace(/^www\./, '') + ' careers')}`;
        this.logger.info(`pending_link ${row.id}: anchor-scan empty, trying DuckDuckGo fallback`);
        let ddgFound: string | null = null;
        try {
          ddgFound = await this.normalHtmlDownloader.loadUrl({
            url: ddgUrl,
            callback: async ({ html }) => pickResultMatchingHost(html, host),
          });
        } catch (e) {
          this.logger.error(`pending_link ${row.id}: DDG fallback load failed: ${getExceptionMessage(e)}`);
        }
        if (ddgFound && ddgFound !== sharedUrl) {
          this.logger.info(`pending_link ${row.id}: DDG fallback found → ${ddgFound}`);
          urlToUse = ddgFound;
          discovered = true;
        } else {
          throw new Error(`Couldn't find a Careers or Jobs link on ${host}. Try sharing the careers page directly.`);
        }
      }
    }

    // Optional 2nd hop: the careers page might be a marketing landing page
    // that links to an ATS or "View open positions" page where the real jobs
    // live. Only attempt when we ended up on a careers-like URL via discovery
    // (or when the user explicitly shared a careers URL — Kong case).
    const visited = new Set<string>([sharedUrl, urlToUse]);
    try {
      const deeper = await this.normalHtmlDownloader.loadUrl({
        url: urlToUse,
        callback: async ({ html }) => discoverJobsListUrl(html, urlToUse),
      });
      if (deeper && !visited.has(deeper)) {
        this.logger.info(`pending_link ${row.id}: careers page links to ATS/job-list → following one more hop to ${deeper}`);
        urlToUse = deeper;
        visited.add(deeper);
      }
    } catch (e) {
      this.logger.error(`pending_link ${row.id}: 2nd-hop probe failed: ${getExceptionMessage(e)} (continuing with current URL)`);
    }

    // Final load + createLink call.
    return await this.normalHtmlDownloader.loadUrl({
      url: urlToUse,
      callback: async ({ html, webPageRuntimeData }) => {
        let title = row.title?.trim() || '';
        if (!title) {
          const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          title = m?.[1]?.trim().slice(0, 256) || urlToUse;
        }

        this.logger.info(`pending_link ${row.id}: calling createLink for ${urlToUse} (title="${title}")`);
        let createResult: { link?: { id: number | string } } = {};
        try {
          createResult = (await this.supabaseApi.createLink({
            title,
            url: urlToUse,
            html,
            webPageRuntimeData,
            force: true,
            scanFrequency: 'daily',
          })) as { link?: { id: number | string } };
        } catch (e) {
          this.logger.error(`pending_link ${row.id}: createLink threw: ${getExceptionMessage(e)}`);
          throw e;
        }

        const linkId = createResult?.link?.id ?? '<no-link-in-response>';
        this.logger.info(`pending_link ${row.id}: createLink returned link_id=${linkId}`);

        if (!createResult?.link?.id) {
          throw new Error(
            `createLink returned no link object (server bailed silently). Response: ${JSON.stringify(createResult).slice(0, 200)}`,
          );
        }

        return { finalUrl: urlToUse, linkId, discovered };
      },
    });
  }
}
