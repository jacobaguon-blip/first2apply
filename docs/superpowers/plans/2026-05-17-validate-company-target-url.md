# Validate Company Target URL Implementation Plan (v2 — post devil's-advocate)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user adds a company target via the "Add Target" dialog, validate that the URL points to a real jobs-list page. If not, recommend a corrected URL before saving.

**Architecture:** Validation runs in Electron main (the desktop probe), reusing the existing JS-rendering `HtmlDownloader` (via its `loadUrl({ url, callback })` API). A pure URL-shape classifier short-circuits known-ATS and obvious single-job patterns. Otherwise the page is rendered, DOM signals are extracted, and the page is classified. Suggestions come from (a) an ATS-aware table for Greenhouse/Lever single-job URLs, (b) a bounded 2-hop path-walk, or (c) anchors discovered on the rendered page. An 8-second wall-clock timeout caps probe duration. The Add Target dialog shows the verdict and offers **Use suggested URL** / **Add anyway** / **Cancel**.

**Tech Stack:** TypeScript, Electron main + renderer, React, zod, `node-html-parser`, existing `HtmlDownloader`, existing `create-link` edge function (unchanged).

**Key decisions (from /decision-frameworks):**
- D1: validator depends on the real JS-rendering `HtmlDownloader.loadUrl` — not raw fetch.
- D2: suggestions = ATS-aware table + bounded 2-hop generic walk. No fallback probe loop in v1.
- D3: 8s wall-clock timeout; on timeout return `unrelated`.
- D4: no telemetry in v1.

---

## Chunk 1: Pre-flight verification (no code)

### Task 0: Verify dependencies and types

- [ ] **Step 1:** Read `apps/desktopProbe/src/server/htmlDownloader.ts` and confirm `loadUrl<T>({ url, scrollTimes, callback }): Promise<T>` exists. (Confirmed in plan authoring; re-verify if upstream has changed.)
- [ ] **Step 2:** Check that `node-html-parser` is in `apps/desktopProbe/package.json` deps. If absent: `npm i -w apps/desktopProbe node-html-parser`.
- [ ] **Step 3:** Confirm jest works in `apps/desktopProbe` with `cd apps/desktopProbe && npx jest --listTests | head -5`.
- [ ] **Step 4:** No commit (verification only).

---

## Chunk 2: URL-shape classifier (pure)

### Task 1: `urlShape.ts`

**Files:**
- Create: `apps/desktopProbe/src/server/targetValidator/urlShape.ts`
- Test: `apps/desktopProbe/src/server/__tests__/urlShape.test.ts`

- [ ] **Step 1: Write failing tests covering ALL single-job ATS patterns**

```ts
import { classifyUrlShape, suggestForLikelySingle } from '../targetValidator/urlShape';

describe('classifyUrlShape', () => {
  test('known ATS list hosts → likely_list', () => {
    expect(classifyUrlShape('https://boards.greenhouse.io/anthropic').verdict).toBe('likely_list');
    expect(classifyUrlShape('https://jobs.lever.co/anthropic').verdict).toBe('likely_list');
    expect(classifyUrlShape('https://jobs.ashbyhq.com/anthropic').verdict).toBe('likely_list');
  });

  test('single-job patterns per ATS → likely_single', () => {
    expect(classifyUrlShape('https://boards.greenhouse.io/anthropic/jobs/4567').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://example.com/careers?gh_jid=12345').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://jobs.lever.co/anthropic/abcd1234-uuid-5678-90ab-cdef12345678').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://jobs.ashbyhq.com/anthropic/abcd1234-uuid-5678-90ab-cdef12345678').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://apply.workable.com/acme/j/ABC123/').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Engineer_R12345').verdict).toBe('likely_single');
  });

  test('bare root non-ATS → needs_probe', () => {
    expect(classifyUrlShape('https://anthropic.com/').verdict).toBe('needs_probe');
  });

  test('invalid URL → invalid', () => {
    expect(classifyUrlShape('not a url').verdict).toBe('invalid');
  });
});

describe('suggestForLikelySingle', () => {
  test('Greenhouse: strips /jobs/<id> back to /<co>', () => {
    expect(suggestForLikelySingle('https://boards.greenhouse.io/anthropic/jobs/4567'))
      .toBe('https://boards.greenhouse.io/anthropic');
  });
  test('Lever: strips uuid back to /<co>', () => {
    expect(suggestForLikelySingle('https://jobs.lever.co/anthropic/abcd1234-uuid-5678-90ab-cdef12345678'))
      .toBe('https://jobs.lever.co/anthropic');
  });
  test('Generic 2-hop fallback', () => {
    expect(suggestForLikelySingle('https://example.com/careers/openings/eng/12345'))
      .toBe('https://example.com/careers/openings');
  });
});
```

- [ ] **Step 2: Run, confirm fail** — `cd apps/desktopProbe && npx jest urlShape -i`
- [ ] **Step 3: Implement**

```ts
export type UrlShapeVerdict = 'likely_list' | 'likely_single' | 'needs_probe' | 'invalid';
export type UrlShape = { verdict: UrlShapeVerdict; reason: string; ats?: AtsKind };
export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'workday' | 'smartrecruiters';

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
    case 'greenhouse': return /\/jobs\/\d+/.test(p);
    case 'lever':      return UUID.test(p);
    case 'ashby':      return UUID.test(p);
    case 'workable':   return /\/j\/[A-Z0-9]+/.test(p);
    case 'workday':    return /\/job\//.test(p);
    case 'smartrecruiters': return /\/jobs\/\d+/.test(p);
    default: return /\/jobs?\/\d{3,}$/.test(p);
  }
}

export function classifyUrlShape(raw: string): UrlShape {
  let u: URL;
  try { u = new URL(raw); } catch { return { verdict: 'invalid', reason: 'not a valid URL' }; }
  const ats = detectAts(u.hostname.toLowerCase());
  if (isSingleJob(u, ats)) return { verdict: 'likely_single', reason: 'single-job URL pattern', ats };
  if (ats)                  return { verdict: 'likely_list', reason: `known ATS list host (${ats})`, ats };
  return { verdict: 'needs_probe', reason: 'no shape signal' };
}

export function suggestForLikelySingle(raw: string): string | undefined {
  let u: URL;
  try { u = new URL(raw); } catch { return undefined; }
  const ats = detectAts(u.hostname.toLowerCase());
  const segs = u.pathname.split('/').filter(Boolean);
  if (ats === 'greenhouse' && segs[1] === 'jobs') {
    return `${u.origin}/${segs[0]}`;
  }
  if ((ats === 'lever' || ats === 'ashby') && UUID.test(segs[segs.length - 1] ?? '')) {
    return `${u.origin}/${segs[0]}`;
  }
  // generic 2-hop walk (drop last 2 segments if present, else 1)
  const drop = Math.min(segs.length, segs.length >= 2 ? 1 : 1);
  return `${u.origin}/${segs.slice(0, segs.length - drop).join('/')}`.replace(/\/$/, '');
}
```

- [ ] **Step 4: Run, confirm pass**
- [ ] **Step 5: Commit** — `feat(probe): URL-shape classifier with ATS-aware single-job detection`

---

## Chunk 3: DOM signals + classifier (pure)

### Task 2: `domSignals.ts`

**Files:**
- Create: `apps/desktopProbe/src/server/targetValidator/domSignals.ts`
- Test: `apps/desktopProbe/src/server/__tests__/domSignals.test.ts`

- [ ] **Step 1: Failing tests (all bodies complete — no `...`)**

```ts
import { extractDomSignals, classifyFromSignals } from '../targetValidator/domSignals';

const listHtml = `<html><body>
  <a href="/jobs/123">SWE</a><a href="/jobs/124">PM</a>
  <a href="/jobs/125">Designer</a></body></html>`;

const singleHtml = `<html><head><title>Senior SWE</title></head><body>
  <h1>Senior SWE</h1><button>Apply Now</button>
  <a href="/careers">Back to all jobs</a></body></html>`;

const landingHtml = `<html><body><h1>Join us</h1>
  <a href="/jobs">See open roles</a></body></html>`;

const junkHtml = `<html><body><a href="mailto:a@b.com">See all jobs</a></body></html>`;

test('jobs list', () => {
  const s = extractDomSignals(listHtml, 'https://x.com/careers');
  expect(classifyFromSignals(s).kind).toBe('jobs_list');
});
test('single job uses back-to-jobs as suggestion', () => {
  const c = classifyFromSignals(extractDomSignals(singleHtml, 'https://x.com/jobs/1'));
  expect(c.kind).toBe('single_job');
  if (c.kind === 'single_job') expect(c.suggestedHref).toBe('/careers');
});
test('landing → suggestedHref points to /jobs', () => {
  const c = classifyFromSignals(extractDomSignals(landingHtml, 'https://x.com/'));
  expect(c.kind).toBe('careers_landing');
  if (c.kind === 'careers_landing') expect(c.suggestedHref).toBe('/jobs');
});
test('mailto/junk hrefs are ignored', () => {
  const c = classifyFromSignals(extractDomSignals(junkHtml, 'https://x.com/'));
  expect(c.kind).toBe('unrelated');
});
```

- [ ] **Step 2: Run, confirm fail**
- [ ] **Step 3: Implement**

```ts
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
const APPLY_RE = /\bapply (now|for this role|for this job)\b/i;

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
    if (isUsableHref(href) && JOB_HREF_RE.test(href)) jobHrefs.add(href);
    if (isUsableHref(href) && !viewJobs && VIEW_JOBS_RE.test(text)) viewJobs = { href, text };
    if (isUsableHref(href) && !backTo && BACK_RE.test(text)) backTo = { href, text };
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
```

- [ ] **Step 4: Run, confirm pass**
- [ ] **Step 5: Commit** — `feat(probe): DOM signal extractor + classifier`

---

## Chunk 4: Orchestrator with timeout

### Task 3: `targetValidator/index.ts`

**Files:**
- Create: `apps/desktopProbe/src/server/targetValidator/index.ts`
- Test: `apps/desktopProbe/src/server/__tests__/targetValidator.test.ts`

The orchestrator depends on a thin adapter, not the full `HtmlDownloader`, for testability:

```ts
export interface HtmlFetcher {
  fetchRenderedHtml(url: string): Promise<string>;
}
```

- [ ] **Step 1: Failing tests**

```ts
import { validateCompanyTargetUrl } from '../targetValidator';

const fetcher = (m: Record<string, string>) => ({
  fetchRenderedHtml: async (u: string) => m[u] ?? Promise.reject(new Error('no fixture')),
});

test('likely_list short-circuits without fetch', async () => {
  let called = false;
  const r = await validateCompanyTargetUrl({
    url: 'https://boards.greenhouse.io/anthropic',
    fetcher: { fetchRenderedHtml: async () => { called = true; return ''; } },
    timeoutMs: 1000,
  });
  expect(r.verdict).toBe('jobs_list');
  expect(called).toBe(false);
});

test('greenhouse single-job → suggestion is /<co>', async () => {
  const r = await validateCompanyTargetUrl({
    url: 'https://boards.greenhouse.io/anthropic/jobs/4567',
    fetcher: fetcher({}),
    timeoutMs: 1000,
  });
  expect(r.verdict).toBe('single_job');
  expect(r.suggestedUrl).toBe('https://boards.greenhouse.io/anthropic');
});

test('needs_probe + list html → jobs_list', async () => {
  const html = `<html><body>${Array.from({length:4}, (_,i)=>`<a href="/jobs/${i}">x</a>`).join('')}</body></html>`;
  const r = await validateCompanyTargetUrl({
    url: 'https://example.com/careers',
    fetcher: fetcher({ 'https://example.com/careers': html }),
    timeoutMs: 1000,
  });
  expect(r.verdict).toBe('jobs_list');
});

test('probe timeout → unrelated', async () => {
  const r = await validateCompanyTargetUrl({
    url: 'https://example.com/',
    fetcher: { fetchRenderedHtml: () => new Promise(() => { /* never resolves */ }) },
    timeoutMs: 50,
  });
  expect(r.verdict).toBe('unrelated');
  expect(r.reason).toMatch(/timeout|timed out/i);
});

test('probe throws → unrelated with reason', async () => {
  const r = await validateCompanyTargetUrl({
    url: 'https://example.com/',
    fetcher: { fetchRenderedHtml: async () => { throw new Error('boom'); } },
    timeoutMs: 1000,
  });
  expect(r.verdict).toBe('unrelated');
  expect(r.reason).toMatch(/boom/);
});
```

- [ ] **Step 2: Run, confirm fail**
- [ ] **Step 3: Implement**

```ts
import { classifyUrlShape, suggestForLikelySingle } from './urlShape';
import { extractDomSignals, classifyFromSignals } from './domSignals';

export interface HtmlFetcher { fetchRenderedHtml(url: string): Promise<string>; }
export type Verdict = 'jobs_list' | 'single_job' | 'careers_landing' | 'unrelated' | 'invalid';
export type ValidationResult = { verdict: Verdict; reason: string; suggestedUrl?: string };

export const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
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
    case 'jobs_list':       return { verdict: 'jobs_list', reason: 'DOM probe detected repeated job links' };
    case 'single_job':      return { verdict: 'single_job', reason: 'apply CTA detected', suggestedUrl: abs(cls.suggestedHref) };
    case 'careers_landing': return { verdict: 'careers_landing', reason: 'view-jobs link detected', suggestedUrl: abs(cls.suggestedHref) };
    case 'unrelated':       return { verdict: 'unrelated', reason: 'no careers/jobs signals on page' };
  }
}
```

- [ ] **Step 4: Run, confirm pass**
- [ ] **Step 5: Commit** — `feat(probe): targetValidator orchestrator with 8s timeout`

---

## Chunk 5: IPC + adapter to real HtmlDownloader

### Task 4: Adapter and IPC handler

**Files:**
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts`
- Modify: `apps/desktopProbe/src/lib/electronMainSdk.tsx`

- [ ] **Step 1:** Build a dedicated single-shot `HtmlFetcher` (NOT reusing the production `HtmlDownloader` pool — that pool's inner `backOff` loop ignores our outer timeout and would leak window slots). Add `apps/desktopProbe/src/server/targetValidator/singleShotFetcher.ts`:

```ts
import { BrowserWindow } from 'electron';
import { HtmlFetcher } from './index';

export function makeSingleShotFetcher(): HtmlFetcher {
  return {
    fetchRenderedHtml: (url: string) => fetchRenderedHtmlWithTimeout(url, 8000),
  };
}

async function fetchRenderedHtmlWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: true, nodeIntegration: false, contextIsolation: true },
  });
  const destroy = () => { try { win.destroy(); } catch {/* already destroyed */} };
  let timer: NodeJS.Timeout | undefined;
  try {
    const work = (async () => {
      await win.loadURL(url);
      await new Promise((r) => setTimeout(r, 1500)); // brief settle for SPAs
      return win.webContents.executeJavaScript('document.documentElement.innerHTML') as Promise<string>;
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { destroy(); reject(new Error(`probe timed out after ${timeoutMs}ms`)); }, timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    destroy();
  }
}
```

Timeout fires `destroy()` *before* rejecting, guaranteeing the window is gone regardless of where the inner load is blocked. `withTimeout` in the orchestrator is now redundant for the probe path but kept as a safety net.

- [ ] **Step 2:** Add IPC handler `validate-company-target-url` taking `{ url }`, returning `ValidationResult`. Wrap in try/catch — on error log via `logger.error('validator failed', { url, err })` and return `{ verdict: 'unrelated', reason: 'validator error: ' + msg }` so the renderer never sees a rejected promise. Use the `makeSingleShotFetcher()` factory; no shared state.
- [ ] **Step 3:** Add `validateCompanyTargetUrl(url: string): Promise<ValidationResult>` to `electronMainSdk.tsx`.
- [ ] **Step 4:** Smoke test in devtools: `await window.electron.validateCompanyTargetUrl('https://boards.greenhouse.io/anthropic/jobs/4567')`.
- [ ] **Step 5:** Commit — `feat(probe): IPC for validateCompanyTargetUrl`.

---

## Chunk 6: UI wiring

### Task 5: Dialog integration

**Files:**
- Modify: `apps/desktopProbe/src/components/createCompanyTarget.tsx`

- [ ] **Step 1:** Add state: `isValidating`, `validation: ValidationResult | null`, `validatedUrl: string | null`.
- [ ] **Step 2:** Submit handler logic:
  1. If `validatedUrl !== form.url` OR `validation == null`: set `isValidating=true`, call `validateCompanyTargetUrl(form.url)`, store result + `validatedUrl=form.url`, set `isValidating=false`. Return (do not save yet) UNLESS verdict is `jobs_list`, in which case fall through to step 3.
  2. If verdict is `jobs_list`: call `createLink({ ... })` as before.
- [ ] **Step 3:** Disable Submit button while `isValidating`. Spinner label "Checking…".
- [ ] **Step 4:** Render verdict-specific Alert:
  - `single_job` / `careers_landing` with `suggestedUrl`: two-button Alert — **Use suggested URL** (writes suggested URL into form, clears `validation`, resubmits) and **Add anyway** (sets `force: true`, calls `createLink`).
  - `single_job` / `careers_landing` without suggestion, or `unrelated`, or `invalid`: Alert with **Add anyway** + **Cancel**.
- [ ] **Step 5:** Watch the URL form field with `form.watch('url')` (or `useEffect` on the value) — when it changes, clear `validation` and `validatedUrl` so the next submit re-validates. Add an explicit test for the stale-validation case in the QA matrix.
- [ ] **Step 6:** Manual UX matrix (Task 7).
- [ ] **Step 7:** Commit — `feat(desktop): pre-submit validation + suggestion UI in Add Target dialog`.

---

## Chunk 7: QA & docs

### Task 6: Manual QA matrix

- [ ] Greenhouse list URL → adds immediately, no Alert.
- [ ] Greenhouse single-job URL → Alert with `boards.greenhouse.io/<co>` suggestion; **Use suggested** saves.
- [ ] Lever single-job URL (uuid) → suggestion correct; accept saves.
- [ ] Workday single-job URL → classified single_job; suggestion is path-walk (may not be a true list — confirm Add Anyway works).
- [ ] anthropic.com root → `careers_landing` with /careers suggestion; accept saves.
- [ ] Random non-careers URL (e.g. https://example.com) → `unrelated`; **Add anyway** still works.
- [ ] Network-down case (airplane mode) → returns `unrelated` with timeout/error reason; **Add anyway** works.
- [ ] URL field edited after a validation → re-validates on next submit.
- [ ] Probe-crashed case (kill BrowserView) → IPC catch returns `unrelated`; UI remains usable.

### Task 7: CHANGELOG entry

- [ ] Append entry to `CHANGELOG.md` describing target validation + suggestion UX (today's date).
- [ ] Commit — `docs: changelog for company target URL validation`.

---

## Out of scope (v1)

- No `/careers`, `/jobs`, `/join-us` fallback probe loop (deferred per /decision-frameworks D2).
- No telemetry on suggestion acceptance (deferred per D4).
- No backend schema changes; `create-link` is unchanged.
- No company-identity verification (URL might be jobs-list for the wrong company — out of scope).
