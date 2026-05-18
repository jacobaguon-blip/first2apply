import { parse } from 'node-html-parser';

export type DomSignals = {
  repeatedJobLinkCount: number;
  hasApplyCta: boolean;
  hasViewJobsLink: { href: string; text: string } | null;
  hasBackToJobsLink: { href: string; text: string } | null;
  h1Count: number;
};

const JOB_HREF_RE = /\/(jobs?|careers|positions|openings)\/[^/?#]+/i;
const VIEW_JOBS_RE = /(see|view|browse|all) (open )?(jobs|roles|positions|openings)/i;
const BACK_RE = /back to (all )?(jobs|careers|positions)/i;
const APPLY_RE = /apply (now|for this role|for this job)/i;

function isUsableHref(h: string): boolean {
  if (!h) return false;
  if (h.startsWith('mailto:') || h.startsWith('javascript:') || h.startsWith('#')) return false;
  return /^https?:\/\//.test(h) || h.startsWith('/');
}

export function extractDomSignals(html: string, _pageUrl: string): DomSignals {
  const root = parse(html);
  const anchors = root.querySelectorAll('a');
  const jobHrefs = new Set<string>();
  let viewJobs: DomSignals['hasViewJobsLink'] = null;
  let backTo: DomSignals['hasBackToJobsLink'] = null;
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? '';
    const text = (a.text ?? '').trim();
    if (!isUsableHref(href)) continue;
    if (JOB_HREF_RE.test(href)) jobHrefs.add(href);
    if (!viewJobs && VIEW_JOBS_RE.test(text)) viewJobs = { href, text };
    if (!backTo && BACK_RE.test(text)) backTo = { href, text };
  }
  const bodyText = root.querySelector('body')?.text ?? '';
  return {
    repeatedJobLinkCount: jobHrefs.size,
    hasApplyCta: APPLY_RE.test(bodyText),
    hasViewJobsLink: viewJobs,
    hasBackToJobsLink: backTo,
    h1Count: root.querySelectorAll('h1').length,
  };
}

export type Classification =
  | { kind: 'jobs_list' }
  | { kind: 'single_job'; suggestedHref?: string }
  | { kind: 'careers_landing'; suggestedHref?: string }
  | { kind: 'unrelated' };

export function classifyFromSignals(s: DomSignals): Classification {
  if (s.repeatedJobLinkCount >= 3) return { kind: 'jobs_list' };
  if (s.hasApplyCta && s.h1Count <= 2) {
    return { kind: 'single_job', suggestedHref: s.hasBackToJobsLink?.href };
  }
  if (s.hasViewJobsLink) return { kind: 'careers_landing', suggestedHref: s.hasViewJobsLink.href };
  return { kind: 'unrelated' };
}
