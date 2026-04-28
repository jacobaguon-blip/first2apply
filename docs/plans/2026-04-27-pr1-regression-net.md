# PR 1 — Regression Net Implementation Plan (v2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up vitest in `apps/desktopProbe`, migrate the one test that protects code being moved to the new scraper library, and add `JobScanner` orchestration tests as the regression net for PR 2's library extraction.

**Architecture:** Vitest as the runner (modern, ESM-native, fast). The library extraction in PR 2 needs tests as a tripwire — if `JobScanner.scanLinks()` behaves identically before and after the move, we know the refactor is safe. We test at the orchestrator level, not the parser level (parsers live in Supabase edge functions, not in the desktop code being moved).

**Tech Stack:** vitest, vite-tsconfig-paths (resolves the `@/` path alias and workspace refs), tsx, TypeScript, the existing Electron + Node setup in `apps/desktopProbe`.

**Branching:** Work on a fresh branch off `master`. PR #17 (the design doc) does not need to be merged first — this PR has no dependency on it.

**Out of scope for PR 1:** Migrating the other 5 inline-harness tests in `apps/desktopProbe`. Adding `HtmlDownloader` unit tests. Parser regression tests.

**Key revisions from v1 (devil's advocate round 1) and v1.1 (code review):**
- C2 fix: vitest config explicitly sets up `vite-tsconfig-paths` so `@/` and `@first2apply/ui` workspace refs resolve.
- C3 fix: vitest config `include` only the migrated/new tests; `exclude` the legacy inline-harness files until they're migrated.
- M3 fix: all required mocks pre-baked in Task 4, including `installLinkedInDecorator` and `dispatchPushoverSummary`. No reactive "if it fails, add another mock" steps.
- L2 fix: removed the inconsistent "verify tsx invocation" step from Task 3.
- **Code-review C2 fix:** added Task 0 — verify constructor signature + `JobScannerSettings` shape against actual code before writing test mocks. Avoids "tests fail at first run, contributor reactively patches mocks" anti-pattern.
- **Code-review M5 fix:** Task 10 verification asserts exact test count, not "≥".

---

## Task 0: Verify the existing code shapes that the test mocks assume

Before writing any mocks, read the real code so the mock shapes match by construction. This is the anti-reactive-mock-additions guard.

**Files to read (no edits):**
- `apps/desktopProbe/src/server/jobScanner.ts:58-110` — constructor destructured params
- `apps/desktopProbe/src/lib/types.ts` — `JobScannerSettings` type (for `updateSettings()` calls in tests)
- `apps/desktopProbe/src/server/notifications/quietHours.test.ts` — existing inline-harness test count

**Step 1: Confirm constructor signature**

```bash
sed -n '58,80p' apps/desktopProbe/src/server/jobScanner.ts
```

Expected destructured params: `{ logger, supabaseApi, normalHtmlDownloader, incognitoHtmlDownloader, onNavigate, analytics }`. If any are different, update Task 4's `makeMocks()` shape to match exactly.

**Step 2: Confirm `JobScannerSettings`**

```bash
grep -A20 'export type JobScannerSettings' apps/desktopProbe/src/lib/types.ts
```

Expected fields used by tests: `cronRule?`, `preventSleep`, `useSound`, `areEmailAlertsEnabled`, `inAppBrowserEnabled`, `pushoverEnabled?`, `pushoverAppToken?`, `pushoverUserKey?`, `isPaused?`. Task 6 + Task 8 use `isPaused`, `pushoverEnabled`, `pushoverAppToken`, `pushoverUserKey`. If any are missing or renamed, update those tasks.

**Step 3: Count quietHours inline tests**

```bash
grep -cE "^\s*test\(" apps/desktopProbe/src/server/notifications/quietHours.test.ts
```

Note the count; Task 3's migration must produce the SAME count. Task 10's verification will assert this exact number, not "≥7."

**No commits in Task 0** — this is a read-only verification. Note the values for use in subsequent tasks.

---

## Task 1: Branch + add vitest as devDependency

**Files:**
- Modify: `apps/desktopProbe/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Branch off master**

```bash
cd /Users/jacobaguon/projects/first2apply
git checkout master
git pull --ff-only origin master
git checkout -b chore/pr1-regression-net
```

**Step 2: Install vitest + path-alias plugin**

```bash
pnpm add -D --filter first2apply-desktop vitest @vitest/expect vite-tsconfig-paths
```

If pnpm filter syntax fails (workspace not configured for that filter): fall back to `cd apps/desktopProbe && pnpm add -D vitest @vitest/expect vite-tsconfig-paths`.

Expected: `package.json` gains the three deps under `devDependencies`. Lockfile updated.

**Step 3: Verify install**

```bash
cd apps/desktopProbe && npx vitest --version
```

Expected: prints a version number. No errors.

**Step 4: Commit**

```bash
git add apps/desktopProbe/package.json pnpm-lock.yaml
git commit -m "chore(desktopProbe): add vitest test runner deps"
```

---

## Task 2: Create vitest config with explicit include/exclude + path resolution

**Files:**
- Create: `apps/desktopProbe/vitest.config.ts`

**Step 1: Write the config**

Create `apps/desktopProbe/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // ONLY pick up tests that have been migrated to vitest. The legacy
    // hand-rolled inline-harness tests (e.g. tailored/builder.test.ts,
    // masterContent/parse.test.ts, connections/connections.test.ts,
    // ai/budget.test.ts, keywords/keywords.test.ts) run assertions at
    // module top level and would corrupt the vitest run on import.
    // Migrate those files in their own follow-up PR.
    include: [
      'src/server/notifications/quietHours.test.ts',
      'src/server/__tests__/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'src/server/tailored/**',
      'src/server/masterContent/**',
      'src/server/connections/**',
      'src/server/ai/**',
      'src/server/keywords/**',
    ],
    environment: 'node',
    globals: false,
    // Electron-coupled modules are mocked via vi.mock() in test files;
    // never imported as the real `electron` package.
    server: { deps: { external: ['electron'] } },
  },
});
```

**Step 2: Wire test scripts**

Modify `apps/desktopProbe/package.json` `scripts` section, add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

**Step 3: Verify the runner picks up the right files**

```bash
cd apps/desktopProbe && npx vitest run --reporter verbose 2>&1 | head -30
```

Expected: vitest finds 1 test file (`quietHours.test.ts`) and reports it has no `describe`/`it` blocks (yet — Task 3 migrates it). The 5 excluded inline-harness files are NOT in the run.

If vitest tries to load any of the excluded files: revisit the `exclude` glob.

**Step 4: Commit**

```bash
git add apps/desktopProbe/vitest.config.ts apps/desktopProbe/package.json
git commit -m "chore(desktopProbe): vitest config with path resolution + scoped include"
```

---

## Task 3: Migrate `quietHours.test.ts` to vitest

**Files:**
- Modify: `apps/desktopProbe/src/server/notifications/quietHours.test.ts`

**Step 1: Read the existing file to enumerate test cases**

```bash
cat apps/desktopProbe/src/server/notifications/quietHours.test.ts
```

List every `test('name', fn)` call from the inline harness. Per `MONDAY-STATUS`, the file claims 7 tests.

**Step 2: Rewrite using vitest's `describe` / `it` / `expect`**

Replace the entire file with vitest-style tests, preserving every assertion. Skeleton:

```ts
import { describe, it, expect } from 'vitest';
import type { QuietHoursSchedule } from '@first2apply/core';

import { isInQuietHours } from './quietHours';

describe('isInQuietHours', () => {
  // (one it() per test case from the inline harness, identical assertions)
  it('returns false outside any window', () => {
    // ... preserved assertion
  });
  // ...
});
```

**Critical:** preserve every existing assertion. Don't drop any. Don't add new ones (those go in a separate PR).

**Step 3: Run only this file**

```bash
cd apps/desktopProbe && npx vitest run src/server/notifications/quietHours.test.ts --reporter verbose
```

Expected: all migrated tests PASS, count matches the inline harness's original "7/7."

**Step 4: Commit**

```bash
git add apps/desktopProbe/src/server/notifications/quietHours.test.ts
git commit -m "test(quietHours): migrate from inline harness to vitest"
```

---

## Task 4: `JobScanner` test scaffolding (full mock set, no reactive additions)

Build the mock infrastructure with all required stubs upfront. The mock-everything-Electron pattern is required because `JobScanner` imports the real `electron` and `installLinkedInDecorator` modules at module load.

**Files:**
- Create: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Write the test file with the full mock set**

Create `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Link } from '@first2apply/core';

// JobScanner imports `electron` at module load (Notification, app, powerSaveBlocker).
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

// browserHelpers.installLinkedInDecorator is called by the JobScanner
// constructor and accesses Electron Session APIs. Stub it.
vi.mock('../browserHelpers', () => ({
  installLinkedInDecorator: vi.fn(),
}));

// dispatchPushoverSummary is the network-side notifier. Mock so tests don't
// fire real Pushover, and so we can assert it was called with the right shape.
vi.mock('../notifications/dispatch', () => ({
  dispatchPushoverSummary: vi.fn().mockResolvedValue({ kind: 'sent' }),
}));

// Stub fs so the constructor doesn't read settings.json off real disk.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// Imports below this line resolve through the mocks above.
import { JobScanner } from '../jobScanner';
import { dispatchPushoverSummary } from '../notifications/dispatch';

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

Expected: vitest reports the file loaded with 0 tests. No module-load errors.

If a different module fails to resolve at import (e.g. `@/lib/analytics`): the `vite-tsconfig-paths` plugin should handle it. If not, double-check `apps/desktopProbe/tsconfig.json` has the `paths` entry that defines `@/*` and that the plugin is active.

**Step 3: Commit**

```bash
git add apps/desktopProbe/src/server/__tests__/jobScanner.test.ts
git commit -m "test(jobScanner): scaffold mocks for orchestration tests"
```

---

## Task 5: Test — `scanLinks` happy path

**Files:**
- Modify: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Add the test inside the `describe('JobScanner', ...)` block**

```ts
it('scanLinks: happy path calls downloader, scanHtmls, postScanHook in order', async () => {
  const links: Link[] = [
    {
      id: 1, url: 'https://example.com/jobs', title: 'Test', user_id: 'u1',
      site_id: 1, created_at: '2026-01-01', scrape_failure_count: 0,
      last_scraped_at: '2026-01-01', scrape_failure_email_sent: false,
      scan_frequency: 'hourly', filter_profile_id: null,
    },
  ];
  const newJobs: Job[] = [
    {
      id: 100, user_id: 'u1', externalId: 'ext-1',
      externalUrl: 'https://example.com/job/1', siteId: 1,
      title: 'Engineer', companyName: 'Acme', tags: [],
      status: 'new', labels: [], created_at: new Date(), updated_at: new Date(),
    },
  ];

  mocks.normalHtmlDownloader.loadUrl.mockImplementation(
    async ({ callback }: { callback: (args: { html: string; webPageRuntimeData: unknown; maxRetries: number; retryCount: number }) => Promise<unknown> }) => {
      return await callback({ html: '<html></html>', webPageRuntimeData: {}, maxRetries: 3, retryCount: 0 });
    },
  );
  mocks.supabaseApi.scanHtmls.mockResolvedValue({ newJobs, parseFailed: false });
  mocks.supabaseApi.listJobs.mockResolvedValueOnce({ jobs: newJobs, hasMore: false, nextPageToken: null });

  const scanner = new JobScanner(mocks);
  await scanner.scanLinks({ links, sendNotification: false });

  expect(mocks.normalHtmlDownloader.loadUrl).toHaveBeenCalledTimes(1);
  expect(mocks.supabaseApi.scanHtmls).toHaveBeenCalledTimes(1);
  expect(mocks.supabaseApi.runPostScanHook).toHaveBeenCalledTimes(1);
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith('scan_links_start', { links_count: 1 });
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith(
    'scan_links_complete',
    expect.objectContaining({ links_count: 1 }),
  );
});
```

**Step 2: Run + commit**

```bash
cd apps/desktopProbe && npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "happy path"
git add -u && git commit -m "test(jobScanner): scanLinks happy-path orchestration"
```

Expected: PASS.

---

## Task 6: Test — `scanLinks` is paused

**Step 1: Add**

```ts
it('scanLinks: returns early when scanner is paused via settings', async () => {
  const scanner = new JobScanner(mocks);
  scanner.updateSettings({ ...scanner.getSettings(), isPaused: true });

  await scanner.scanLinks({ links: [], sendNotification: false });

  expect(mocks.normalHtmlDownloader.loadUrl).not.toHaveBeenCalled();
  expect(mocks.supabaseApi.scanHtmls).not.toHaveBeenCalled();
  expect(mocks.analytics.trackEvent).toHaveBeenCalledWith(
    'scan_skipped_paused',
    expect.any(Object),
  );
});
```

**Step 2: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "paused"
git add -u && git commit -m "test(jobScanner): paused short-circuit"
```

---

## Task 7: Test — `scanLinks` skips concurrent invocation

**Step 1: Add**

```ts
it('scanLinks: skips when a scan is already running', async () => {
  let resolveFirst: () => void = () => {};
  mocks.normalHtmlDownloader.loadUrl.mockImplementation(
    () => new Promise<unknown[]>((resolve) => { resolveFirst = () => resolve([]); }),
  );

  const scanner = new JobScanner(mocks);
  const firstScan = scanner.scanLinks({
    links: [{ id: 1 } as Link],
    sendNotification: false,
  });

  await scanner.scanAllLinks();
  expect(mocks.normalHtmlDownloader.loadUrl).toHaveBeenCalledTimes(1);

  resolveFirst();
  await firstScan;
}, 5000);
```

**Step 2: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "concurrent"
git add -u && git commit -m "test(jobScanner): concurrent-scan suppression"
```

---

## Task 8: Test — `showNewJobsNotification` routes through `dispatchPushoverSummary`

The mock for `dispatchPushoverSummary` was pre-baked in Task 4. Just assert against it.

**Files:**
- Modify: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`

**Step 1: Add the test**

```ts
it('showNewJobsNotification: routes pushover via dispatchPushoverSummary when configured', async () => {
  const newJobs: Job[] = [
    {
      id: 100, user_id: 'u1', externalId: 'e',
      externalUrl: 'https://x', siteId: 1, title: 'Engineer',
      companyName: 'Acme', tags: [], status: 'new', labels: [],
      created_at: new Date(), updated_at: new Date(),
    },
  ];
  mocks.supabaseApi.getUser.mockResolvedValue({ user: { id: 'u1' } });
  const scanner = new JobScanner(mocks);
  scanner.updateSettings({
    ...scanner.getSettings(),
    pushoverEnabled: true,
    pushoverAppToken: 'app-token',
    pushoverUserKey: 'user-key',
  });

  scanner.showNewJobsNotification({ newJobs });

  // dispatchPushoverSummary fires async via .then chain. Wait a tick.
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

**Step 2: Run + commit**

```bash
npx vitest run src/server/__tests__/jobScanner.test.ts --reporter verbose -t "dispatchPushoverSummary"
git add -u && git commit -m "test(jobScanner): pushover routes through dispatchPushoverSummary"
```

If the test depends on `ENV.pushover.appToken` being unset (`jobScanner.ts:412-414` reads `ENV.pushover.appToken || this._settings.pushoverAppToken`): the `apps/desktopProbe/src/env.ts` module reads `process.env` at import time. Since the test environment has no `PUSHOVER_APP_TOKEN` env var, `ENV.pushover.appToken` is `undefined`, settings wins. No additional mock needed.

---

## Task 9: Wire nx target

**Step 1: Inspect the nx config**

```bash
cd /Users/jacobaguon/projects/first2apply
ls apps/desktopProbe/project.json 2>&1
```

If `project.json` exists, check whether it has explicit `test` target. If not (most likely — nx infers from package.json scripts), the `"test": "vitest run"` we added in Task 2 is automatically picked up.

**Step 2: Verify nx picks it up**

```bash
npx nx run first2apply-desktop:test 2>&1 | tail -20
```

Expected: vitest runs, prints PASS for all migrated + new tests. Total count: 7 (quietHours) + 4 (new JobScanner) = 11.

**Step 3: If `project.json` has explicit targets without `test`, add it**

```json
"test": {
  "executor": "nx:run-script",
  "options": { "script": "test" }
}
```

Commit if changed:

```bash
git add -u && git commit -m "build(nx): wire desktopProbe test target to vitest"
```

---

## Task 10: Final verification + push + PR

**Step 1: Full project test suite**

```bash
cd /Users/jacobaguon/projects/first2apply
npx nx run first2apply-desktop:test --reporter verbose
```

Expected: exactly `<quietHours-count-from-Task-0> + 4` tests PASS. With the Task 0 measured count of 7, total = 11. Use exact equality (>= masks off-by-one regressions).

**Step 2: Full project typecheck (no regression)**

```bash
npx nx run first2apply-desktop:typecheck
```

Expected: clean.

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
- Migrates `quietHours.test.ts` from its hand-rolled inline-harness pattern to vitest. The other 5 inline-harness tests stay as-is (excluded via vitest config) — they protect code that doesn't move in PR 2.
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

**Step 5: Update memory after PR merges**

Append to `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md`:

```
- PR 1 (regression net) merged 2026-04-XX — vitest in desktopProbe, JobScanner tests as tripwire for PR 2.
```

---

## Done

When the PR merges, the next step is the PR 2 plan (`docs/plans/<date>-pr2-library-extraction.md`). Don't write that plan ahead of time — write it after PR 1 merges so the context is fresh and any surprises from PR 1 inform PR 2's task breakdown.
