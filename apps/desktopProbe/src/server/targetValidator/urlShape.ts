export type UrlShapeVerdict = 'likely_list' | 'likely_single' | 'needs_probe' | 'invalid';
export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'workday' | 'smartrecruiters';
export type UrlShape = { verdict: UrlShapeVerdict; reason: string; ats?: AtsKind };

const ATS_LIST_HOSTS: { host: RegExp; kind: AtsKind }[] = [
  { host: /^boards\.greenhouse\.io$/, kind: 'greenhouse' },
  { host: /^jobs\.lever\.co$/, kind: 'lever' },
  { host: /^jobs\.ashbyhq\.com$/, kind: 'ashby' },
  { host: /^apply\.workable\.com$/, kind: 'workable' },
  { host: /\.myworkdayjobs\.com$/, kind: 'workday' },
  { host: /^careers\.smartrecruiters\.com$/, kind: 'smartrecruiters' },
];

const UUID = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

function detectAts(host: string): AtsKind | undefined {
  return ATS_LIST_HOSTS.find((a) => a.host.test(host))?.kind;
}

function isSingleJob(u: URL, ats?: AtsKind): boolean {
  const p = u.pathname;
  if (/[?&]gh_jid=\d+/.test(u.search)) return true;
  switch (ats) {
    case 'greenhouse':
      return /\/jobs\/\d+/.test(p);
    case 'lever':
    case 'ashby':
      return UUID.test(p);
    case 'workable':
      return /\/j\/[A-Z0-9]+/.test(p);
    case 'workday':
      return /\/job\//.test(p);
    case 'smartrecruiters':
      return /\/jobs\/\d+/.test(p);
    default:
      return /\/jobs?\/\d{3,}$/.test(p);
  }
}

export function classifyUrlShape(raw: string): UrlShape {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { verdict: 'invalid', reason: 'not a valid URL' };
  }
  const ats = detectAts(u.hostname.toLowerCase());
  if (isSingleJob(u, ats)) return { verdict: 'likely_single', reason: 'single-job URL pattern', ats };
  if (ats) return { verdict: 'likely_list', reason: `known ATS list host (${ats})`, ats };
  return { verdict: 'needs_probe', reason: 'no shape signal' };
}

export function suggestForLikelySingle(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  const ats = detectAts(u.hostname.toLowerCase());
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return undefined;
  if (ats === 'greenhouse' && segs[1] === 'jobs') {
    return `${u.origin}/${segs[0]}`;
  }
  if ((ats === 'lever' || ats === 'ashby') && UUID.test(segs[segs.length - 1] ?? '')) {
    return `${u.origin}/${segs[0]}`;
  }
  // generic 1-hop walk
  const trimmed = segs.slice(0, -1).join('/');
  return trimmed ? `${u.origin}/${trimmed}` : u.origin;
}
