# PR 3 of 5 — `apps/serverProbe` implementation

You are continuing the **server-probe** project for `first2apply`. PR 1 (vitest setup) and PR 2 (`libraries/scraper` extraction) are already merged to `master`. PR 19 (PR 2) may still be open — verify and merge first if so. PR 3 is yours to ship.

## Step 1 — Load context (always do this first)

Read these in order:

1. `docs/plans/2026-04-27-server-probe-design.md` — **the design doc.** This is the source of truth. PR 3's scope is in §5.PR-3 and details are scattered through §3 (architecture), §4 (deployment).
2. `decisions.md` — append-only log. Look at the most recent entries to see what scope adjustments PRs 1+2 made.
3. `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md` — auto-loaded session memory; cross-reference for known blockers.
4. `libraries/scraper/src/index.ts` and `libraries/scraper/src/types.ts` — what the lib exports for you to consume.
5. `apps/serverProbe/src/main.ts` and `apps/serverProbe/package.json` — current scaffold state.
6. `apps/desktopProbe/src/server/scraperAdapters.ts` — reference impl of how the desktop adapts the lib's interfaces.
7. `apps/desktopProbe/src/server/htmlDownloader.ts` — the desktop's concrete `IHtmlDownloader` impl, which serverProbe will adapt for headless use.

## Step 2 — Verify PR 19 state

```bash
gh pr view 19 --json state,mergeable
```

If still `OPEN` and `MERGEABLE`: `gh pr merge 19 --squash --delete-branch`, then `git checkout master && git pull`.
If already `MERGED`: skip.

## Step 3 — Branch

```bash
git checkout master && git pull --ff-only origin master
git checkout -b feat/pr3-server-probe-impl
```

## Step 4 — Ship PR 3

Per design §5.PR-3, the scope is:

### 4a. `apps/serverProbe/src/main.ts` — Electron main process
- **CRITICAL ORDERING:** `app.commandLine.appendSwitch('no-sandbox')` MUST be called BEFORE `app.whenReady()`. Put it at the very top of the file, before any other Electron API access. Document with a comment block per design §4.3.
- Inside `app.whenReady()`: construct the JobScanner from `@first2apply/scraper` with server-side adapters (see 4c).
- Wire three CLI modes (parse `process.argv`):
  - `--selftest` — boots Electron+Xvfb, exits 0 within 10s. No supabase calls. Used by CI smoke.
  - `--dry-run` — full scrape against cloud, **skips writes + notifications** (passes `dryRun: true` through scanner config; the lib's scanner.scanLinks should respect this — if it doesn't, add a thin gate at the call sites of `scanHtmls`, `runPostScanHook`, `dispatchPushoverSummary`).
  - `--scan-once` — full end-to-end one-shot, writes to prod, fires real Pushover.
  - `--probe-once` — deprecated alias for `--scan-once`. Logs a deprecation warning, then maps to scan-once.
- `F2A_MOCK_SCRAPE=1` env var: emits `console.warn("F2A_MOCK_SCRAPE is deprecated; use --dry-run flag")` AND maps to `dryRun=true`.
- Default mode (no flags): start the cron + serve `/healthz` and run forever.

### 4b. `apps/serverProbe/src/env.ts` — env validation
- Read required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`, `OPENAI_API_KEY`, `APPROVAL_HMAC_SECRET`.
- If any missing, print clear error and `process.exit(1)`.
- Validation runs **before** `app.whenReady()`.

### 4c. `apps/serverProbe/src/adapters.ts` — server-side adapters

Implement the `@first2apply/scraper` interfaces:

- **`EnvSettingsProvider`** implements `ISettingsProvider<JobScannerSettings>`. `load()` builds settings from env vars; optionally fetches `user_settings` row from supabase on a 5-min refresh tick (defer the supabase part if it's complex; v0 can be env-only). `save()` is a no-op (logs that settings are externally managed).
- **`ConsoleLogger`** implements `ILogger`. Writes to stdout in JSON-line format with timestamp + level. Optional file mirror to `/opt/first2apply/logs/server-probe.log` if env var `F2A_LOG_FILE=1`.
- **`NoopAnalytics`** implements `IAnalyticsClient`. Just `console.debug(name, props)`.
- **`HiddenWindowDownloader`** — copy/adapt `apps/desktopProbe/src/server/htmlDownloader.ts`. Same logic, same `BrowserWindow({show:false})` calls; the difference is it runs under Xvfb in the container instead of a Mac/Win compositor.
  - Copy `apps/desktopProbe/src/server/browserHelpers.ts` and `workerQueue.ts` into `apps/serverProbe/src/` too (these are tightly coupled to the downloader).
  - Pass an empty `sessionDecorator` (or copy the LinkedIn one if the server scrapes LinkedIn) — your call.

### 4d. `libraries/scraper/src/health/healthServer.ts` — health endpoint

- Tiny `node:http` server bound to `127.0.0.1:7878`.
- `GET /healthz`: returns 200 if `processStartedAt` is within `min(2 * cronIntervalMs, 10 * 60 * 1000)` of now (bootstrap grace), OR if `Date.now() - lastSuccessfulScanFinishedAt < 2 * cronIntervalMs`. Otherwise 503 with body `{ "status": "stale", "lastScanAt": <iso> }`.
- Exports a `startHealthServer({ getLastScanAt, getCronIntervalMs })` function used by serverProbe (not desktop).
- Add to `libraries/scraper/src/index.ts` exports.

### 4e. Verify
```bash
# Lib build
cd libraries/scraper && npm run build && cd ../..

# Desktop typecheck still clean (we touched the lib)
npx nx run first2apply-desktop:typecheck

# serverProbe typecheck
npx nx run first2apply-server-probe:typecheck

# Run --selftest locally (works on Mac since we're not in Docker yet — will fail
# at Electron init without a display; that's fine for now, save real test for PR 4)
cd apps/serverProbe && npm run build && node dist/main.js --selftest
```

The `--dry-run` end-to-end test against your cloud Supabase is **deferred to PR 4** because it requires the Docker image. PR 3 ships the code; PR 4 puts it in a container.

## Step 5 — Commit, push, PR

```bash
git add -A
git commit -m "feat(serverProbe): Electron headless shell with --selftest/--dry-run/--scan-once (PR 3 of 5)

[detailed message — match the format of recent commits]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin feat/pr3-server-probe-impl
gh pr create --base master --title "feat(serverProbe): Electron headless shell (PR 3 of 5)" --body "..."
```

PR body must include `## Test plan` section. Reference design §5.PR-3 pass conditions.

## Step 6 — Log + handoff

1. Append to `decisions.md` under a new heading `## YYYY-MM-DDTHH:MM-07:00 — PR 3 (serverProbe impl) shipped` describing scope adjustments encountered (there will be some — e.g., Xvfb on Mac local-test impossibility, Electron version pinning details, BrowserWindowPool simplifications).

2. Update `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md` with a one-line PR 3 entry.

3. Stop and prompt the user with this exact message:
   > "PR 3 (#XX) shipped — Electron headless serverProbe with --selftest/--dry-run/--scan-once modes. **Clear context (`/clear`) and paste `docs/handoff/PR4-prompt.md` to continue with PR 4 (Dockerfile + Pi systemd update).**"

Do NOT proceed to PR 4 in the same session. Each PR gets a fresh context window for clean execution.

## Acceptance criteria (PR 3)

- [ ] `libraries/scraper` build clean (no new typecheck errors after health server added)
- [ ] `apps/serverProbe` typecheck clean
- [ ] `apps/serverProbe` builds (`tsc -p tsconfig.json`)
- [ ] `--selftest` mode at minimum compiles and parses CLI args correctly
- [ ] PR opened with `## Test plan` section
- [ ] decisions.md + memory updated
- [ ] User prompted to /clear and start PR 4
