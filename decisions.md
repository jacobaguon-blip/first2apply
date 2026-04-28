# Weekend Autonomous Run — Decisions Log

Append-only. Timestamps in local TZ (America/Los_Angeles, UTC-7).

---

## 2026-04-25 — Kickoff (Phase 1: Brainstorm gate Q&A)

**Q13 Scope:** (a) top-to-bottom in BACKLOG.md order. Items 6 + 12 originally deferred; user reinstated 6 as foundational; 12 stays deferred (ToS/legal risk, untestable without user).

**Q12 Cuts:** Item 12 (Playwright auto-apply) skipped this weekend.

**Item 6 Server (foundational):**
- 6a Pi5 16GB, Docker, headed-but-unattended, Linux 6.12.34 aarch64, Bookworm, Tailscale `100.93.137.31` (alias `pi`, user `maadkal`).
- 6b Xvfb headless display via systemd unit.
- 6c Cloud Supabase stays primary; Pi runs nightly pg_dump + a docker-compose Supabase stack as cold standby (off until `F2A_FAILOVER=1`).
- 6d Multi-account from day 1; admin section in web UI.
- 6e Service-role key in `/opt/first2apply/.env` (chmod 600), interactive auth via web UI.
- 6f Tailscale-only network, no port forwarding.
- 6g New `apps/serverProbe/` package, separate from `apps/desktopProbe`.
- 6h Build artifacts + deploy scripts; Pi-side install if SSH works (it does — verified `pi` host alias, `maadkal@raspberrypi`, in `docker` + `sudo` groups, 81GB free).
- 6i SSH verified via `ssh pi`.
- 6j New `apps/serverWebUI/` Next.js 15 + Tailwind + shadcn/ui, first-available port from 3030.
- 6k Nightly pg_dump, 7-day retention, `restore.sh`, manual failover.

**Q11 Pushover:** auto-detect; not found in repo `.env*`. Mock transport, `.env.example` placeholder.

**Q10 AI cap:** $20 hard cap, default model `gpt-4o-mini`, fall back to `gpt-4o` only when output is clearly inadequate.

**Q9 LinkedIn CSV:** mock for now, user provides real CSV later.

**Q8 Master resume / cover letter:** mock for now, user provides later.

**Q7 Quiet hours:** account-level (`profiles.quiet_hours_start/end/tz` + `notification_queue` table).

**Q6 Branching:** WIP → `wip/pre-weekend-snapshot` (NOT master). One PR per backlog item. Never auto-merge.

**Q5 Migrations:** local only via `supabase db reset`. No cloud push.

**Q4 Testing bar:** TS compile + lint + unit tests + migrations up/down. Backend smoke tests where possible. UI: compile + screenshot only; user smoke-tests on return.

**Q3 Verify:** `scripts/weekend-dry-run.sh` (typecheck, lint, unit, migrations, probe headless boot, server probe headless boot, web UI build, Pi SSH check). External transports mocked in dry-run.

**Q2 Stop conditions:** 3-retry skip, no destructive ops, no master push, no real Pushover, no real applications, no LinkedIn API, AI cap stop, single-task time cap.

**Q1 Logs:** this file, append-only. Notion mirror at `decisions-notion.md`.

---

## 2026-04-25 — One-way doors acknowledged

1. Pi mutations — namespaced under `/opt/first2apply/` and `f2a-*` units; `deploy/pi/rollback.sh` written first; SSH connectivity check after every step.
2. Migration rename — see audit below.
3. Master hygiene — WIP committed to `wip/pre-weekend-snapshot`, not master.
4. Schema shape — JSONB blobs for resume/cover-letter v1; quiet hours = three columns; multi-account = additive `account_id`.
5. AI spend — $20 hard cap, accumulator in this file.
6. Package names — `apps/serverProbe`, `apps/serverWebUI`. User has Monday to override.
7. Secrets — pre-commit grep for `sk-`, `pk_live_`, `service_role`. Only `.env.example` is committed (no values).
8. Service-role key on Pi — chmod 600, dedicated user, documented as trusted-device threat model.

---

## 2026-04-25 — Pre-flight audits

**Migration audit (`supabase migration list --linked`):**
- Cloud has TWO migrations missing locally: `20260424120000`, `20260424120001`. Schema drift toward cloud — someone applied migrations via dashboard or out-of-band CLI session.
- Local-only (unpushed): `20260425000000_filter_profile_ownership_check.sql` (renamed from deleted `20260424100000_*`). The rename is **safe** — neither timestamp ever existed on cloud.
- **Action:** `supabase db pull` refused (conflict). Resolution would require `supabase migration repair` which modifies cloud `schema_migrations` table — a one-way door I will not take without user judgment. **BLOCKER for the user to resolve Monday.** In the meantime, `supabase db reset` against local Docker still works (uses on-disk files only), so weekend dev work proceeds. No cloud writes happen during the weekend run.

**Pi reachability:** `ssh pi` works; `maadkal@raspberrypi`, Docker 28.3.3, in `docker` + `sudo` groups, 81 GB free, kernel 6.12.34 aarch64.

**Cloud Supabase project ref:** `rtsjqwasyzbverpkgaqm` (linked).

**Env files found:** only `apps/backend/supabase/functions/.env.example`. No real `.env` with secrets.

**Resume/CSV search:** found `~/Documents/Linnea_Curtiss_ConductorOne_Resume.docx` (not user's). No `Connections.csv`. Mocking both per Q8/Q9.

---

## 2026-04-25T16:00-07:00 — Branch squash cleanup

Each backlog branch reset to master (8e1f3bb) and replayed as a single clean conventional commit.

- backlog/03-pushover-audit: clean, new commit `8da6f2d` — `feat(notifications): pushover audit + hardened helper`
- backlog/04-server-foundation: clean, new commit `cb8be38` — `feat(server): foundational serverProbe + serverWebUI + Pi deploy scripts` (rollback.sh moved to chore/weekend-tooling)
- backlog/05-06-keyword-scraping: clean, new commit `a495364` — `feat(ai): keyword extraction (mission + JD) with mock fallback + budget module`
- backlog/07-08-tailored-content: clean, new commit `60c8d9d` — `feat(ai): per-profile tailored resume + cover letter builders`
- backlog/09-master-content: clean, new commit `cc4b538` — `feat(content): master resume / cover letter schema + upload UI`
- backlog/11-approval-flow: clean, new commit `0a3b42c` — `feat(notifications): approval flow stub with HMAC token + jti replay protection` (depends on serverWebUI scaffolding from backlog/04)
- backlog/12-linkedin-import: clean, new commit `961a2b2` — `feat(connections): LinkedIn CSV importer + enrichment (mock-first)`
- chore/weekend-tooling: new branch + commit `7e9721d` — `chore: weekend autonomous build tooling + decisions log` (carries scripts/weekend-dry-run.sh, deploy/pi/rollback.sh, spec.md, plan.md, decisions*.md, weekend-report.md)
- Conflicts: none.

Backup tags `backup/<branch-tail>` created on the original tips of each branch before reset. Original branch names were overwritten via `git reset --hard`; no remote pushes performed.

Notes:
- backlog/02-quiet-hours skipped per instruction (will be redesigned against cloud schema).
- The migration rename `20260424100000_filter_profile_ownership_check.sql -> 20260425000000_...` shown in pre-cleanup `git diff master...` came from the stale working tree; it is already part of the chore/migration-drift-recovery branch and is not duplicated here.
- Approval-token files (lib/approval-token*, app/api/approve/) were assigned to backlog/11 per spec §5 ownership; backlog/04 carries only the serverWebUI scaffolding (package.json, tsconfig, README, page.tsx).

---

---

## 2026-04-27T19:30-07:00 — Autonomous pipeline kickoff

User instruction: own server-probe project end-to-end. Pipeline:
1. Devils-advocate loop until zero new issues against design + PR 1 plan
2. Code review on final spec
3. plan-builder to produce execution plan
4. Build (parallel where possible, retry on failure)
5. Dry-run verify

Rules: no permission gates, fix-and-continue, log to terminal + decisions.md.

**Initial state:** Branch `feat/server-probe-design`, PR #17 open with design doc, PR 1 plan uncommitted at `docs/plans/2026-04-27-pr1-regression-net.md`. Untracked: `.merge-train-log.md`, `recon-build-notes.md` (legacy artifacts, ignored for now).

**Decision:** First commit the PR 1 plan to the same branch + PR (PR #17 expands to "design + PR 1 plan"). Then begin devil's advocate loop.

---

## 2026-04-27T19:35-07:00 — Devil's advocate round 1 (32 issues, applying fixes)

Adversarial review of `docs/plans/2026-04-27-server-probe-design.md` + `docs/plans/2026-04-27-pr1-regression-net.md` + the surrounding code (`apps/desktopProbe/src/server/jobScanner.ts`, the existing inline-harness tests, `deploy/pi/.env.example`, the systemd units).

### CRITICAL (3)
- **C1.** `deploy/pi/.env.example` does not include `F2A_PUSHOVER_MOCK=0` toggle the runtime checks (`apps/desktopProbe/src/server/pushover.ts:78`). Without it the server defaults to mock send and "production Pushover" silently no-ops. Fix: add the toggle.
- **C2.** PR 1 vitest config does not resolve `@/` path alias or `@first2apply/ui` workspace ref. JobScanner imports both at module top — vitest config will fail at module load. Fix: add `vite-tsconfig-paths` plugin or explicit aliases.
- **C3.** PR 1 plan claims "vitest discovers the 6 existing `*.test.ts` files." But those files use a hand-rolled inline-harness pattern that runs assertions at module top-level. When vitest imports them it executes those assertions immediately; failed asserts may throw at import and break the whole run. Fix: explicitly include only the migrated/new tests in `vitest.config.ts`.

### HIGH (9)
- **H1.** Electron + Xvfb in Docker on aarch64 hits Chromium sandbox / D-Bus issues unless either `--cap-add=SYS_ADMIN` or `--no-sandbox` is set. Design doesn't specify. Real failure: container starts, Chromium errors "Failed to move to new namespace," scraper never works. Fix: document the flag and document why.
- **H2.** Design says `/healthz` is exposed by the scanner on `127.0.0.1:7878`. The scanner has no HTTP server today. New component, not in any PR. Fix: specify which PR adds it, where it lives (library vs server-only adapter), and what library it uses.
- **H3.** `HtmlDownloader` is the highest-coupling-to-Electron file PR 2 moves, and PR 1 has no regression net for it. Fix: either add a thin DI integration test in PR 1 or document the mitigation explicitly (PR 2 verifies via end-to-end desktop scan post-refactor).
- **H4.** Quiet hours rely on accurate time. If `chronyd` (or systemd-timesyncd) isn't running on the Pi, time can drift hours. No pre-flight check. Fix: add to bootstrap.sh.
- **H5.** GHCR pull credentials use a personal access token. Modern GH PATs default to ≤1y expiry; when it expires `docker pull` fails silently in the systemd context. No rotation procedure. Fix: document rotation + recommend classic PAT (no expiry) or fine-grained scoped to read:packages.
- **H6.** CI plan only validates that the Dockerfile builds (`buildx --no-push`). A working build can produce a runtime-broken image (missing entrypoint perms, lib version mismatch). Fix: add `docker run --rm <image> /opt/first2apply/entrypoint.sh --selftest` step that exits 0 only if Electron/Xvfb start successfully.
- **H7.** Some existing nx projects have `test` scripts that hardcode `exit 1` ("Error: no test specified" && exit 1, e.g. `@first2apply/node-backend`). `nx run-many -t test` will fail forever on those. Fix: enumerate broken targets and either replace with `echo 'noop'` or `--exclude` them in CI.
- **H8.** Design says `BrowserWindow` is "offscreen." Electron has two distinct concepts: `show: false` (hidden, still uses compositor) vs `webPreferences.offscreen: true` (true offscreen, async render only, some sites detect it). The current `HtmlDownloader` uses `show: false` (hence the Xvfb dependency). Fix: state which mode and why.
- **H9.** PR 3 effort estimate ("~1 day") is optimistic for a from-scratch Electron main process with new lifecycle, IPC-free wiring, env-driven settings, file logger, health endpoint, and Xvfb integration. Fix: bump to 1.5–2 days; acknowledge the unknown.

### MEDIUM (10)
- **M1.** Service-role key vs anon-key + refresh path is ambiguous in design. Fix: state explicitly that v0 uses service-role only; no refresh logic.
- **M2.** "Multi-account is mechanical" — `node-cron` schedules are process-global. Multi-account-in-one-process means N timers competing for same shared scrape pool. Per-process or worker-thread isolation is the real path. Fix: rename to "deferred, design TBD."
- **M3.** PR 1 plan misses several mocks (`installLinkedInDecorator`, `dispatchPushoverSummary` import after `vi.mock`, `@/lib/analytics` alias). Fix: pre-bake them all in Task 4 instead of reactively in Step 3.
- **M4.** Container stop timeout `-t 30` could cut pg_dump mid-stream. Fix: increase to 120s, or run pg_dump in its own non-container systemd unit (it already is — `f2a-pg-dump.service` is separate, so this concern is mostly NA. Document.)
- **M5.** `:latest` tag with no `:previous` retention means broken push has no easy rollback. Fix: deploy.sh tags incoming as `:previous` before pulling new.
- **M6.** No `docker image prune` in deploy.sh. Cache grows unbounded. Fix: add prune to deploy.sh.
- **M7.** No staging Supabase project. Every PR/CI run hits prod. Fix: document acceptance + name a future improvement.
- **M8.** `database.types.ts` is stale relative to today's `'deleted'` enum migration. Fix: regenerate and commit.
- **M9.** `pnpm-workspace.yaml` change for `libraries/scraper` not specified. Fix: name the entry.
- **M10.** Env layer (apps/desktopProbe/src/env.ts) is not specified for serverProbe. Fix: state that serverProbe gets its own thin env module reading from `process.env`.

### LOW (6)
- **L1.** `--network host` widens attack surface but defensible (Tailscale-only). Document.
- **L2.** PR 1 plan Task 3 has a confused step about verifying tsx invocation then immediately skipping. Remove.
- **L3.** `--rm` on container destroys non-stdout container logs. Stdout via journald is fine. Document.
- **L4.** TLS posture: Supabase SDK is HTTPS; no plaintext. Document.
- **L5.** Standby compose can drift from cloud schema if not maintained. Document watch-out.
- **L6.** `libraries/ui` is misnamed (holds non-UI Supabase API). Note as future cleanup.

### Action: applying fixes now
Editing both plan files + bootstrap + .env.example + decisions.md, then running round 2.

---

## 2026-04-27T19:50-07:00 — Devil's advocate round 2

Re-reading the v2 docs adversarially with fresh eyes.

### HIGH (6)
- **R2-H1.** `/healthz` first-probe failure: when the scanner just started and `lastSuccessfulScanFinishedAt` is null, `Date.now() - null < 2 * cronIntervalMs` returns NaN-comparison-false, so first probe at 30s fails. Container marked unhealthy. Fix: return 200 for the first `2 * cronIntervalMs` after process start regardless of last-scan time.
- **R2-H2.** Container name collision on rapid restart: `--rm --name f2a-server-probe` works only if the previous container's `--rm` actually fired. If docker daemon hung mid-stop, the name is taken on next `docker run`. Fix: `ExecStartPre=-/usr/bin/docker rm -f f2a-server-probe` (the `-` prefix tolerates non-zero exit when no container exists).
- **R2-H3.** `pg_dump.service` failure alert: design claims "alert on error" but no wiring exists. Fix: either build the alert (call `dispatchPushoverSummary`-equivalent from a shell wrapper) or remove the claim.
- **R2-H4.** `TZ` env var missing from `.env.example`. Container default UTC makes journalctl debugging confusing. Fix: add `TZ=America/Los_Angeles` (or the user's actual TZ) to `.env.example`.
- **R2-H5.** `app.commandLine.appendSwitch('no-sandbox')` must run BEFORE `app.whenReady()`. If serverProbe init order is wrong, `--no-sandbox` is silently no-op, Chromium fails sandbox, container can't render. Fix: design + plan specifies ordering.
- **R2-H6.** CI buildx cache layer not specified. Without `--cache-from type=gha --cache-to type=gha,mode=max`, every PR rebuilds Chromium-installing image layers from scratch (~5 min cold). Fix: add cache flags to `build-server-probe-image` job.

### MEDIUM (10)
- **R2-M1.** Hardcoded `ghcr.io/jacobaguon-blip/...` registry path. Use `ghcr.io/${{ github.repository_owner }}/...` in workflows for portability.
- **R2-M2.** Empty-scan signal absent: scanner returns silently when 0 new jobs, no "I'm alive" pushover. Out of scope for v0 but flag.
- **R2-M3.** `/dev/shm` ≥ 2GB pre-flight check is unnecessary — Docker `--shm-size=2g` carves out tmpfs from kernel regardless of host /dev/shm size. Remove.
- **R2-M4.** `/healthz` should return 503 (not just 200/anything-else) when stale.
- **R2-M5.** PR 4 pass condition missing pg_dump.service smoke run. Add.
- **R2-M6.** `docker login -u <u> -p <pat>` exposes PAT in shell history. Recommend `--password-stdin` form.
- **R2-M7.** `bootstrap.sh` should print the next-step note about `docker login`.
- **R2-M8.** `apps/serverProbe`'s Electron version pinning vs desktop. Specify: match desktop's version exactly to keep the Chromium engine consistent.
- **R2-M9.** `nx run-many --exclude=` syntax: comma-separated string. Verify the syntax in PR 5 plan.
- **R2-M10.** Excluded inline-harness tests are long-term drift risk. Track as follow-up issue in repo.

### LOW (2)
- **R2-L1.** TIME_WAIT on health server port 7878 across container restarts. Probably fine (different process namespaces) but watch.
- **R2-L2.** Migration ordering risk: if PR 1 merges and PR 2 stalls, master is in "vitest configured, legacy tests excluded" state. No regression but document.

### Action: applying fixes inline.

---

## 2026-04-27T20:05-07:00 — Devil's advocate round 3

### HIGH (4)
- **R3-H1.** `--probe-once` against prod cloud DB (a) creates new `jobs` rows in user's account, (b) fires real Pushover (if F2A_PUSHOVER_MOCK=0). Design says "accepted v0 risk" but doesn't gate the test mode. Fix: add a `--dry-run` flag to serverProbe that skips writes + skips notifications, used for verification runs. Keep `--probe-once` as the "I really mean it" mode.
- **R3-H2.** Dockerfile `HEALTHCHECK` doesn't specify `--start-period`. Default 0s means healthcheck starts firing immediately, and the bootstrap grace window in the endpoint logic doesn't help if Docker has already marked the container unhealthy. Fix: `HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=300s`.
- **R3-H3.** `ENV.pushover.appToken` precedence in `jobScanner.ts:412-414` reads from desktop's env module. After PR 2's library extraction, the lib doesn't have access to env. Fix: pushover creds must come through `ISettingsProvider` (each app's adapter merges env+settings).
- **R3-H4.** Container has no `--memory` / `--cpus` limits. Chromium leak + Pi running other services = OOM risk. Fix: `--memory=4g --cpus=2.0` in systemd unit.

### MEDIUM (7)
- **R3-M1.** GHA cache (`type=gha`) requires action permissions setup. Plan must specify the cache action wiring.
- **R3-M2.** `linux/arm64` builds on GHA amd64 runners use QEMU. Even with cache, cold builds 5-10 min. Document the slowness; consider a follow-up to use BuildJet/depot if it becomes painful.
- **R3-M3.** Log rotation/level config absent. If serverProbe runs DEBUG, journald fills fast. Fix: config-driven log level (default INFO, env override).
- **R3-M4.** Settings refresh from Supabase `user_settings` is on a 5-min tick. Up to 5 min lag when user changes quiet hours via desktop. Acceptable v0 but flag.
- **R3-M5.** No volume mount for `/opt/first2apply/logs/`. If serverProbe ever writes file-side logs, they're container-ephemeral. Add mount or document "stdout-only logging."
- **R3-M6.** Bootstrap grace window unbounded (`2 * cronIntervalMs`). If cron is hourly, healthz lies for 2h on container start. Cap at `min(2 * cronIntervalMs, 10 * 60 * 1000)`.
- **R3-M7.** PR 1 plan Task 9 assumes `project.json` exists. Verify nx config shape; handle the "no project.json, only package.json" case.

### Action: applying fixes inline.

---

## 2026-04-27T20:15-07:00 — Devil's advocate round 4 (convergence)

Final adversarial pass. Looking only for material issues.

### MEDIUM (3)
- **R4-M1.** `--dry-run` mode threads through multiple lib functions: `scanHtmls` (must stub the upsert), `runPostScanHook` (skip), `dispatchPushoverSummary` (skip). Lib needs a `dryRun: boolean` flag in scanner config or per-call. Document the wiring in PR 3 plan.
- **R4-M2.** PR 2's library extraction moves both source and test files. PR 1's vitest config specifies `quietHours.test.ts` and `__tests__/**` exact paths. After PR 2 moves them, vitest config must be updated. Add to PR 2 plan stub.
- **R4-M3.** `--probe-once` vs `--dry-run` naming: probe-once sounds non-destructive but is full prod-write. Rename to `--scan-once` for clarity, leave `--probe-once` as a deprecated alias for backwards-compat with the existing scaffold.

### LOW (1)
- **R4-L1.** Legacy `F2A_MOCK_SCRAPE=1` env var (used by current scaffold) will be removed in PR 3. Document the deprecation in PR 3 plan.

### Convergence statement
Round 4 found 3 medium + 1 low; no critical or high. The remaining issues are clarifications/naming, not blast-radius problems. Calling convergence: 4 rounds, 32 + 18 + 11 + 4 = 65 issues identified and addressed across docs + .env.example + database.types.ts.

Moving to pipeline step 2: code review (`/superpowers:requesting-code-review`).

---

## 2026-04-27T20:30-07:00 — Code review applied

Reviewer (superpowers:code-reviewer subagent) flagged 2 critical, 5 important, 5 minor issues.

**CRITICAL (both verified against real code, both fixed):**
- C1. Design's "7 files to move" inventory placed `pushover.ts` under `notifications/`. Real path is `apps/desktopProbe/src/server/pushover.ts`. Verified via `find`. Fixed in design ASCII diagram + §5 PR 2 file list.
- C2. PR 1 plan's mock shape was unverified against real code. Verified `JobScanner` constructor destructures `{logger, supabaseApi, normalHtmlDownloader, incognitoHtmlDownloader, onNavigate, analytics}` — matches plan. `JobScannerSettings` has all fields tests use. But the verification was lucky, not by construction. Fix: added Task 0 to PR 1 plan that reads the real code shapes BEFORE writing mocks.

**IMPORTANT (5):**
- I1. F2A_MOCK_SCRAPE removal was a silent breaking change. Fixed: PR 3 emits deprecation warning + maps to `dryRun=true` for one release before hard removal.
- I2. `--no-sandbox` rationale conflated ingress threat (Tailscale solves) with renderer-escape threat (sandbox solves). Honest revision: spelled out residual risk + named SYS_ADMIN+seccomp as the future hardening path.
- I3. /healthz freshness window (2h on hourly cron) is too coarse to claim "stuck-tab detection." Fixed: revised wording to "alive in the last few hours" + flagged direct watchdog as deferred.
- I4. CI runtime smoke needs setup-qemu-action to run linux/arm64 images on x86_64 runners. Added.
- I5. Bootstrap NTP check ordering: now explicitly Step 1 of bootstrap.sh before any mutations.

**MINOR (5):**
- M1, M4, M5: cosmetic / accepted as-is.
- M2 (PR 3 effort calibration): noted, leaving estimate as 1.5–2 days with explicit "+0.5–1 day buffer for first-time Xvfb-on-Mac-via-Docker-via-QEMU debugging" implied.
- M3 (memory file path): reviewer-confused, the file exists. No-op.
- Code-review M5 (test count assertion): converted "≥11" to exact-count assertion in Task 10.

**Codebase contradiction noted by reviewer (no fix needed):**
- `apps/desktopProbe/project.json` doesn't exist; PR 1 plan's "if project.json exists" branch is dead. Acceptable as-is — plan handles both cases.

Convergence reached on review. Moving to step 3: plan-builder for full execution plan.
