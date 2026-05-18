import { classifyFromSignals, extractDomSignals } from './domSignals';
import { classifyUrlShape, suggestForLikelySingle } from './urlShape';

export interface HtmlFetcher {
  fetchRenderedHtml(url: string): Promise<string>;
}

export type Verdict = 'jobs_list' | 'single_job' | 'careers_landing' | 'unrelated' | 'invalid';
export type ValidationResult = { verdict: Verdict; reason: string; suggestedUrl?: string };

export const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function validateCompanyTargetUrl(opts: {
  url: string;
  fetcher: HtmlFetcher;
  timeoutMs?: number;
}): Promise<ValidationResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shape = classifyUrlShape(opts.url);
  if (shape.verdict === 'invalid') return { verdict: 'invalid', reason: shape.reason };
  if (shape.verdict === 'likely_list') return { verdict: 'jobs_list', reason: shape.reason };
  if (shape.verdict === 'likely_single') {
    return { verdict: 'single_job', reason: shape.reason, suggestedUrl: suggestForLikelySingle(opts.url) };
  }

  let html: string;
  try {
    html = await withTimeout(opts.fetcher.fetchRenderedHtml(opts.url), timeoutMs);
  } catch (e) {
    return { verdict: 'unrelated', reason: (e as Error).message };
  }

  const signals = extractDomSignals(html, opts.url);
  const cls = classifyFromSignals(signals);
  const abs = (href?: string) => (href ? new URL(href, opts.url).toString() : undefined);
  switch (cls.kind) {
    case 'jobs_list':
      return { verdict: 'jobs_list', reason: 'DOM probe detected repeated job links' };
    case 'single_job':
      return { verdict: 'single_job', reason: 'apply CTA detected', suggestedUrl: abs(cls.suggestedHref) };
    case 'careers_landing':
      return { verdict: 'careers_landing', reason: 'view-jobs link detected', suggestedUrl: abs(cls.suggestedHref) };
    case 'unrelated':
      return { verdict: 'unrelated', reason: 'no careers/jobs signals on page' };
  }
}
