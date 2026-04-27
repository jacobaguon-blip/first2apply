# PR 1 — Regression Net Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up vitest in `apps/desktopProbe`, migrate the one test that protects code being moved to the new scraper library, and add `JobScanner` orchestration tests as the regression net for PR 2's library extraction.

**Architecture:** Vitest as the runner (modern, ESM-native, fast). The library extraction in PR 2 needs tests as a tripwire — if `JobScanner.scanLinks()` behaves identically before and after the move, we know the refactor is safe. We test at the orchestrator level, not the parser level (parsers live in Supabase edge functions, not in the desktop code being moved).

**Tech Stack:** vitest, tsx, TypeScript, the existing Electron + Node setup in `apps/desktopProbe`. No new transpiler, no new runner conflicts.

**Branching:** Work on a fresh branch off `master`. PR 17 (the design doc) does not need to be merged first — this PR has no dependency on it.

**Out of scope for PR 1:** Migrating the other 5 inline-harness tests in `apps/desktopProbe` (they protect code that stays in the desktop app, not code being moved). Adding `HtmlDownloader` unit tests (would require pre-injecting `BrowserWindow`, which is PR 2's seam work). Parser regression tests (those live in `apps/backend` and are already partially covered by `jobListParser.test.ts`).

---

## Task 1: Branch + add vitest as devDependency

**Files:**
- Modify: `apps/desktopProbe/package.json`

**Step 1: Branch off master**

```bash
cd /Users/jacobaguon/projects/first2apply
git checkout master
git pull --ff-only origin master
git checkout -b chore/pr1-regression-net
```

**Step 2: Install vitest**

```bash
pnpm add -D --filter first2apply-desktop vitest @vitest/expect
```

Expected: `package.json` gains `"vitest": "^X.Y.Z"` and `"@vitest/expect": "^X.Y.Z"` under `devDependencies`. Lockfile updated.

**Step 3: Verify install**

```bash
cd apps/desktopProbe
npx vitest --version
```

Expected: prints a version number (e.g. `2.x.y`). No errors.

**Step 4: Commit**

```bash
git add apps/desktopProbe/package.json pnpm-lock.yaml
git commit -m "chore(desktopProbe): add vitest as test runner"
```

---

## Task 2: Create vitest config

**Files:**
- Create: `apps/desktopProbe/vitest.config.ts`

**Step 1: Write the config**

Create `apps/desktopProbe/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Match every *.test.ts under src/ — eventually replaces the
    // hand-rolled tsx-run inline-harness pattern.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Electron-coupled modules will be mocked at the test level; we never
    // import the real `electron` package in unit tests.
    server: { deps: { external: ['electron'] } },
  },
});
```

**Step 2: Wire the test script**

Modify `apps/desktopProbe/package.json` `scripts` section, add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

**Step 3: Verify the runner picks up files**

```bash
cd apps/desktopProbe && npx vitest run --reporter verbose 2>&1 | head -30
```

Expected: vitest discovers the 6 existing `*.test.ts` files. Most likely all FAIL (they use the inline-harness pattern, not `describe`/`it`). That's expected — we're going to migrate one.

**Step 4: Commit**

```bash
git add apps/desktopProbe/vitest.config.ts apps/desktopProbe/package.json
git commit -m "chore(desktopProbe): add vitest config + npm test script"
```

---

## Task 3: Migrate `quietHours.test.ts` to vitest

The other 5 inline-harness tests stay as-is for now — they test code that doesn't move in PR 2.

**Files:**
- Modify: `apps/desktopProbe/src/server/notifications/quietHours.test.ts`

**Step 1: Read the existing file**

```bash
cat apps/desktopProbe/src/server/notifications/quietHours.test.ts
```

Note the test cases the inline harness covers — list them. Examples might include "outside window returns false," "inside window returns true," "grace minutes extension," etc.

**Step 2: Rewrite using vitest's `describe` / `it` / `expect`**

Replace the entire file with vitest-style tests, preserving every assertion. Skeleton:

```ts
import { describe, it, expect } from 'vitest';
import type { QuietHoursSchedule } from '@first2apply/core';

import { isInQuietHours } from './quietHours';

describe('isInQuietHours', () => {
  // (one it() per test case from the inline harness, identical assertions)
});
```

**Critical:** preserve every existing assertion. Don't drop any. Don't add new ones.

**Step 3: Run only this file**

```bash
cd apps/desktopProbe && npx vitest run src/server/notifications/quietHours.test.ts --reporter verbose
```

Expected: all migrated tests PASS. Same count as the original inline harness reported (per `MONDAY-STATUS`, this was "7/7").

**Step 4: Verify the original tsx invocation still works**

```bash
cd apps/desktopProbe && npx tsx src/server/notifications/quietHours.test.ts
```

Wait — actually the inline harness is GONE after Step 2. Skip this verification; the migration is complete.

**Step 5: Commit**

```bash
git add apps/desktopProbe/src/server/notifications/quietHours.test.ts
git commit -m "test(quietHours): migrate from inline harness to vitest"
```

---

## Task 4: Sketch the `JobScanner` test scaffolding

Before writing the actual orchestration tests, build the mock infrastructure they need. This is one Task because it's all type-mechanical and the file isn't useful without all of it.

**Files:**
- Create: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Build the test file with mock factories**

Create `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Link } from '@first2apply/core';

// JobScanner imports `electron` at module load (for `Notification`, `app`).
// Stub it out before importing JobScanner.
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    show: vi.fn(),
  })),
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
  },
  powerSaveBlocker: {
    start: vi.fn().mockReturnValue(0),
    stop: vi.fn(),
  },
}));

// Stub fs so the constructor doesn't read settings.json off real disk.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
  };
});

import { JobScanner } from '../jobScanner';

// Minimal mocks for the constructor params.
function makeMocks() {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const supabaseApi = {
    listLinks: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue({ jobs: [], hasMore: false, nextPageToken: null }),
    runPostScanHook: vi.fn().mockResolvedValue(undefined),
    scanHtmls: vi.fn().mockResolvedValue({ newJobs: [], parseFailed: false }),
    scanJobDescription: vi.fn(),
    listSites: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue({ user: null }),
    getSupabaseClient: vi.fn(),
  };
  const normalHtmlDownloader = {
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const incognitoHtmlDownloader = {
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const analytics = { trackEvent: vi.fn() };
  return {
    logger,
    supabaseApi,
    normalHtmlDownloader,
    incognitoHtmlDownloader,
    analytics,
    onNavigate: vi.fn(),
  };
}

describe('JobScanner', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = makeMocks();
  });

  // tests added in subsequent tasks
});
```

**Step 2: Run it to confirm the file at least loads**

```bash
cd apps/desktopProbe && npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose
```

Expected: test file is recognized, "no tests" or all-pass with zero tests. No module-load errors.

**Step 3: If it fails on `installLinkedInDecorator`** (which the JobScanner constructor calls), add another mock:

```ts
vi.mock('../browserHelpers', () => ({
  installLinkedInDecorator: vi.fn(),
}));
```

Re-run.

**Step 4: Commit**

```bash
git add apps/desktopProbe/src/server/__tests__/jobScanner.test.ts
git commit -m "test(jobScanner): scaffold mocks for orchestration tests"
```

---

## Task 5: Test — `scanLinks` happy path

Capture the orchestration: given N links, the scanner calls `loadUrl` once per link, ships the HTML to `scanHtmls`, calls `runPostScanHook`, and fires `showNewJobsNotification` for any new jobs.

**Files:**
- Modify: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Add the test inside the `describe('JobScanner', ...)` block**

```ts
it('scanLinks: happy path calls downloader, scanHtmls, postScanHook in order', async () => {
  const links: Link[] = [
    { id: 1, url: 'https://example.com/jobs', title: 'Test', user_id: 'u1', site_id: 1, created_at: '2026-01-01', scrape_failure_count: 0, last_scraped_at: '2026-01-01', scrape_failure_email_sent: false, scan_frequency: 'hourly', filter_profile_id: null },
  ];
  const newJobs: Job[] = [
    { id: 100, user_id: 'u1', externalId: 'ext-1', externalUrl: 'https://example.com/job/1', siteId: 1, title: 'Engineer', companyName: 'Acme', tags: [], status: 'new', labels: [], created_at: new Date(), updated_at: new Date() },
  ];

  // Set up: downloader returns one batch of new jobs; scanHtmls returns them
  mocks.normalHtmlDownloader.loadUrl.mockImplementation(async ({ callback }: { callback: (args: { html: string; webPageRuntimeData: unknown; maxRetries: number; retryCount: number }) => Promise<unknown> }) => {
    return await callback({ html: '<html></html>', webPageRuntimeData: {}, maxRetries: 3, retryCount: 0 });
  });
  mocks.supabaseApi.scanHtmls.mockResolvedValue({ newJobs, parseFailed: false });
  mocks.supabaseApi.listJobs.mockResolvedValueOnce({ jobs: newJobs, hasMore: false, nextPageToken: null });

  const scanner = new JobScanner(mocks);
  await scanner.scanLinks({ links, sendNotification: false });

  expect(mocks.normalHtmlDownloader.loadUrl).toHaveBeenCalledTimes(1);
  expect(mocks.supabaseApi.scanHtmls).toHaveBeenCalledTimes(1);
  expect(mocks.supabaseApi.runPostScanHook).toHaveBeenCalledTimes(1);
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith('scan_links_start', { links_count: 1 });
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith('scan_links_complete', expect.objectContaining({ links_count: 1 }));
});
```

**Step 2: Run it**

```bash
cd apps/desktopProbe && npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "happy path"
```

Expected: PASS. If it fails, debug — common issues:
- Constructor reads from settings file: confirm `fs.existsSync` mock returns false
- `installLinkedInDecorator` complaint: confirm the mock added in Task 4 step 3
- TypeScript errors on `mocks` shape: cast as needed (`as any` is acceptable in tests where type cosmetics don't add safety)

**Step 3: Commit**

```bash
git add apps/desktopProbe/src/server/__tests__/jobScanner.test.ts
git commit -m "test(jobScanner): scanLinks happy-path orchestration"
```

---

## Task 6: Test — `scanLinks` is paused

**Step 1: Add the test**

```ts
it('scanLinks: returns early when scanner is paused via settings', async () => {
  const scanner = new JobScanner(mocks);
  // settings.isPaused not exposed publicly; use updateSettings (the public path)
  scanner.updateSettings({ ...scanner.getSettings(), isPaused: true });

  await scanner.scanLinks({ links: [], sendNotification: false });

  expect(mocks.normalHtmlDownloader.loadUrl).not.toHaveBeenCalled();
  expect(mocks.supabaseApi.scanHtmls).not.toHaveBeenCalled();
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith('scan_skipped_paused', expect.any(Object));
});
```

**Step 2: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "paused"
git add -u && git commit -m "test(jobScanner): paused short-circuit"
```

Expected: PASS.

---

## Task 7: Test — `scanLinks` skips concurrent invocation

**Step 1: Add**

```ts
it('scanLinks: skips when a scan is already running', async () => {
  // Set up a long-running first scan we never await
  let resolveFirst: () => void = () => {};
  mocks.normalHtmlDownloader.loadUrl.mockImplementation(
    () => new Promise<unknown[]>((resolve) => { resolveFirst = () => resolve([]); }),
  );

  const scanner = new JobScanner(mocks);
  const firstScan = scanner.scanLinks({
    links: [{ id: 1 } as Link],
    sendNotification: false,
  });

  // While first is in flight, second should bail
  await scanner.scanAllLinks();
  expect(mocks.normalHtmlDownloader.loadUrl).toHaveBeenCalledTimes(1);

  resolveFirst();
  await firstScan;
});
```

**Step 2: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "concurrent"
git add -u && git commit -m "test(jobScanner): concurrent-scan suppression"
```

Expected: PASS. If it hangs: there's likely a missing await in the test; debug with `--reporter verbose` and add a timeout: `it('...', async () => {...}, { timeout: 5000 })`.

---

## Task 8: Test — `showNewJobsNotification` routes through `dispatchPushoverSummary`

This test locks in PR #14's wiring (the dispatch path we shipped earlier today).

**Files:**
- Modify: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Mock the dispatch module**

At the top of the file (with the other `vi.mock` calls):

```ts
vi.mock('../notifications/dispatch', () => ({
  dispatchPushoverSummary: vi.fn().mockResolvedValue({ kind: 'sent' }),
}));
```

**Step 2: Add the test**

```ts
import { dispatchPushoverSummary } from '../notifications/dispatch';

// ... inside describe block ...
it('showNewJobsNotification: routes pushover via dispatchPushoverSummary when configured', async () => {
  const newJobs: Job[] = [
    { id: 100, user_id: 'u1', externalId: 'e', externalUrl: 'https://x', siteId: 1, title: 'Engineer', companyName: 'Acme', tags: [], status: 'new', labels: [], created_at: new Date(), updated_at: new Date() },
  ];
  // Stub user + creds
  mocks.supabaseApi.getUser.mockResolvedValue({ user: { id: 'u1' } });
  // Need to seed pushover config via settings
  const scanner = new JobScanner(mocks);
  scanner.updateSettings({
    ...scanner.getSettings(),
    pushoverEnabled: true,
    pushoverAppToken: 'app-token',
    pushoverUserKey: 'user-key',
  });

  scanner.showNewJobsNotification({ newJobs });

  // dispatchPushoverSummary is fired async (then-chain). Wait a tick.
  await new Promise((r) => setImmediate(r));

  expect(dispatchPushoverSummary).toHaveBeenCalledTimes(1);
  expect(dispatchPushoverSummary).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      userId: 'u1',
      jobIds: [100],
      pushoverAppToken: 'app-token',
      pushoverUserKey: 'user-key',
    }),
  );
});
```

**Step 3: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "dispatchPushoverSummary"
git add -u && git commit -m "test(jobScanner): pushover routes through dispatchPushoverSummary"
```

Expected: PASS.

If env-var override path (`ENV.pushover.appToken`) is consulted before settings, the test will need to mock `../env` too. The current code in `jobScanner.ts:412-414` is `ENV.pushover.appToken || this._settings.pushoverAppToken` — so settings is the fallback. With ENV unmocked in tests, `ENV.pushover.appToken` is `undefined`, settings wins, behavior matches.

---

## Task 9: Wire nx target

The `nx run @first2apply/desktopProbe:test` command should run vitest. The desktop project may need a target definition.

**Files:**
- Inspect: `apps/desktopProbe/project.json` (or `nx.json`)

**Step 1: Find the project config**

```bash
find apps/desktopProbe -maxdepth 2 -name "project.json" -o -name "package.json" | head
nx show project first2apply-desktop --json 2>/dev/null | head -40
```

Expected: existing project config. Note whether targets are defined in `project.json` or inferred from `package.json` scripts.

**Step 2: Add `test` target if needed**

If the existing config infers targets from `package.json` (most likely): the `"test": "vitest run"` script we added in Task 2 is automatically picked up. No further wiring needed.

If `project.json` exists and has explicit targets: add a `test` target there:

```json
"test": {
  "executor": "nx:run-script",
  "options": { "script": "test" }
}
```

**Step 3: Verify nx picks it up**

```bash
cd /Users/jacobaguon/projects/first2apply
npx nx run first2apply-desktop:test 2>&1 | tail -20
```

Expected: vitest runs, prints PASS for all migrated + new tests. Test count should match: 7 (quietHours, originally) + 4 (new JobScanner tests) = 11.

**Step 4: Commit if changes were made**

```bash
git add -u && git commit -m "build(nx): wire desktopProbe test target to vitest" || true
```

---

## Task 10: Final verification + push + PR

**Step 1: Run the full project test suite**

```bash
cd /Users/jacobaguon/projects/first2apply
npx nx run first2apply-desktop:test --reporter verbose
```

Expected: all green. Note exact pass count for the PR description.

**Step 2: Run full project typecheck (no regression)**

```bash
npx nx run first2apply-desktop:typecheck
```

Expected: clean — no new TS errors. If there are: fix before pushing.

**Step 3: Push the branch**

```bash
git push -u origin chore/pr1-regression-net
```

**Step 4: Open the PR**

```bash
gh pr create --base master --title "chore(test): vitest setup + JobScanner regression tests (PR 1 of 5)" --body "$(cat <<'EOF'
## Summary
First of five PRs implementing the server-probe design (#17). Establishes the regression net for PR 2's `libraries/scraper` extraction.

- Adds vitest as the test runner in `apps/desktopProbe` (no test runner existed; six `*.test.ts` files were orphaned, executed via ad-hoc `tsx` invocations).
- Migrates `quietHours.test.ts` from its hand-rolled inline-harness pattern to vitest. The other 5 inline-harness tests stay as-is — they protect code that doesn't move in PR 2.
- Adds 4 new `JobScanner` orchestration tests covering scanLinks happy-path, paused short-circuit, concurrent-scan suppression, and the PR #14 pushover dispatch routing.
- Wires `nx run first2apply-desktop:test` to vitest.

## Why orchestration not parsing
Parsers live in `apps/backend/supabase/functions/_shared/parsers/` (Deno). They're untouched by PR 2's library extraction. The actual code being moved is the orchestrator (`JobScanner`), the Electron-coupled `HtmlDownloader` wrapper, and the notification helpers. `JobScanner` orchestration tests are the right tripwire for the move.

## Test plan
- [ ] `npx nx run first2apply-desktop:test` — all green (count: 11+)
- [ ] `npx nx run first2apply-desktop:typecheck` — clean
- [ ] Manual: launch `npm start` in `apps/desktopProbe`, confirm scan still works (sanity)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 5: Update memory**

After the PR is merged, append to `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md`:

```
- PR 1 (regression net) merged 2026-04-XX — vitest in desktopProbe, JobScanner tests as tripwire for PR 2.
```

---

## Done

When the PR merges, the next step is the PR 2 plan (`docs/plans/<date>-pr2-library-extraction.md`). Don't write that plan ahead of time — write it after PR 1 merges so the context is fresh and any surprises from PR 1 inform PR 2's task breakdown.
