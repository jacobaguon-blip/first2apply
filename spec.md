# Weekend Autonomous Build Spec — first2apply

**Author:** Claude (acting as PM) on behalf of Jacob Aguon
**Date:** 2026-04-25
**Run window:** Sat 2026-04-25 — Mon 2026-04-27
**Working branch root:** `wip/pre-weekend-snapshot` (PRs branch off this)
**Deploy target for item 6:** `pi` (Tailscale `100.93.137.31`, user `maadkal`, Pi5 16GB, Bookworm aarch64, Docker 28.3.3)

---

## 1. Scope

Top-to-bottom in `BACKLOG.md` order.

| # | Item | Disposition | Notes |
|---|------|-------------|-------|
| 1 | Explicit Save button on AI filter profile prompt | **P0 build** | ~30 min UX. |
| 2 | Quiet hours queue/deliver | **P0 build** | Account-level Supabase. |
| 3 | Pushover audit (call sites, payload, rate limits) | **P0 build** | Doc + refactor. |
| 4 | Rebuild as server (Pi5 24/7) | **P1 foundational** | Packages + deploy scripts; partial Pi install. Item 12 NOT built; item 13 covers approval flow. |
| 5 | Keyword scraping from mission statement | **P2 build** | Mocked AI. |
| 6 | Keyword scraping from job description | **P2 build** | Mocked AI. |
| 7 | Per-profile resume builder | **P2 build** | Schema + UI; content mocked (Q8). |
| 8 | Per-profile cover letter builder | **P2 build** | Same as #7. |
| 9 | Global master resume + cover letter | **P2 build** | Schema + upload UI; content mocked. |
| 10 | Auto-apply via Playwright | **DEFER (Q12)** | Not built. ToS/legal risk; needs user. |
| 11 | Approve job apps via Pushover | **P2 build (stub)** | Notification + approval-state machine, no actual submit. |
| 12 | LinkedIn connections CSV import | **P1 build** | Mocked CSV (Q9), real importer + enrichment logic. |

---

## 2. Decisions (from kickoff Q&A)

See `decisions.md` § "Kickoff (Phase 1)" for full record. Highlights:

- AI cap **$20**, default model `gpt-4o-mini`.
- Pushover transport **mocked** (no creds in repo).
- Master resume / Connections CSV **mocked** with synthetic fixtures; user provides real data Monday.
- Quiet hours **account-level** (`profiles.quiet_hours_*` + `notification_queue`).
- Branching: one branch + PR per item, **never auto-merge to master**.
- Migrations: local-only via `supabase db reset`; **no `db push`**.
- Testing: TS compile, lint, unit, migrations up/down, backend smoke tests; UI = compile + screenshot only.
- Notion mirror: `decisions-notion.md`.

---

## 3. One-way doors & mitigations

See `decisions.md` § "One-way doors". Active mitigations:

- Pi changes namespaced under `/opt/first2apply/` and `f2a-*` systemd units. `deploy/pi/rollback.sh` written and verified before any Pi mutation.
- No firewall, SSH config, kernel, or Tailscale changes on Pi.
- Pre-commit grep for `sk-`, `pk_live_`, `service_role`. Only `.env.example` is committed.
- WIP committed to `wip/pre-weekend-snapshot`, not master.
- Service-role key on Pi: chmod 600, dedicated user, threat model documented.

---

## 4. Stop conditions

- 3 consecutive failed retries on a task → skip, log, continue.
- Destructive op required (force-push, db drop, dep removal, cloud schema modify) → skip, document.
- AI spend cap hit → mock-only mode for AI-dependent tasks.
- Pi unreachable post-step → halt that item, continue others.
- Drift in cloud `schema_migrations` is a known **BLOCKER** for user Monday; weekend work uses `db reset` against local Docker only.

---

## 5. Item-by-item delivery contract

### Item 1 — Explicit Save button on AI filter profile prompt
- **Where:** `apps/desktopProbe/src/pages/filters.tsx`
- **Change:** Replace blur-autosave with `Save` button at bottom of prompt editor + name field. Disable button until dirty. Show toast on save. Keep existing API call.
- **Tests:** unit test for dirty-state hook; screenshot baseline.
- **Branch:** `backlog/01-explicit-save-button`
- **PR title:** `feat(filters): explicit save button for AI filter profile prompt`

### Item 2 — Quiet hours
- **Schema:** migration `2026XXXX_quiet_hours.sql` adds `profiles.quiet_hours_start TIME`, `quiet_hours_end TIME`, `quiet_hours_tz TEXT DEFAULT 'UTC'`. New table `notification_queue (id uuid pk, user_id uuid fk, payload jsonb, queued_at timestamptz, deliver_after timestamptz, delivered_at timestamptz null)`.
- **Logic:** A `notification_dispatcher` service checks each candidate notification: if user has quiet hours and now is in window, insert into `notification_queue` with `deliver_after = end_of_window`. A periodic flusher (every 60s in probe; cron job in server) selects rows where `deliver_after <= now()` and `delivered_at IS NULL`, dispatches, marks delivered.
- **UI:** New section in `settings.tsx` for quiet-hours pickers + tz dropdown.
- **Tests:** unit tests for window check (DST edge cases, midnight crossover, tz). Integration test against local Supabase.
- **Branch:** `backlog/02-quiet-hours`

### Item 3 — Pushover audit
- **Deliverable:** `docs/pushover-audit.md` — every call site, payload shape, current title/body conventions, action URLs, current rate-limit handling. Recommend a single `sendPushover(payload)` helper if call sites diverge.
- **Refactor:** if helper missing, add `apps/desktopProbe/src/server/notifications/pushover.ts` (and equivalent in serverProbe) with typed payload, mock transport in dev, retry with exponential backoff (max 3, base 500ms), 429 respect.
- **Branch:** `backlog/03-pushover-audit`

### Item 4 — Server rebuild (foundational)
- **New packages:**
  - `apps/serverProbe/` — Electron main-only process, headless via Xvfb, imports `apps/desktopProbe/src/server/*` (jobScanner, scrapers). No React, no renderer windows. Entry: `src/main.ts`. Builds via `electron-builder --linux --arm64`.
  - `apps/serverWebUI/` — Next.js 15 App Router + Tailwind + shadcn/ui. Listens on first-available port from 3030. Auth via Supabase JWT. Admin routes gated by `role='admin'` claim. Pages: `/login`, `/dashboard`, `/admin/users`, `/admin/probes`, `/profile/quiet-hours`.
- **Multi-account:** new migration adds `accounts` table + `account_members`. `profiles` gets `account_id` (nullable, defaults to user's personal account on first login via trigger).
- **Deploy:** `deploy/pi/` folder:
  - `bootstrap.sh` — installs Docker (idempotent check), creates `first2apply` system user (uid namespace), creates `/opt/first2apply/`, pulls images, copies systemd units, writes `.env.example`.
  - `rollback.sh` — disables and removes every `f2a-*` unit, stops/removes every `f2a-*` container, rm -rf `/opt/first2apply/`. **Written and verified first.**
  - `compose.standby.yaml` — full Supabase stack (postgres, gotrue, postgrest, realtime, storage, edge-runtime), profile `standby`, off by default.
  - `pg_dump.sh` — nightly dump of cloud project to `/var/backups/supabase/YYYY-MM-DD.sql.gz`, 7-day retention.
  - `restore.sh` — restores latest dump into the local standby stack.
  - Systemd units: `f2a-server-probe.service`, `f2a-web-ui.service`, `f2a-pg-dump.timer` + `.service`.
- **What ships this weekend on Pi:** rollback script, bootstrap dry-run (no `--apply`), build artifacts pushed to `/opt/first2apply/builds/` only. Live services NOT enabled until user reviews Monday. Reasoning: minimizes risk of leaving Pi in a broken state if an item later in the weekend errors.
- **What does NOT ship to Pi:** systemd `enable`/`start`, port binding, cloud key file. Those are gated behind a `deploy/pi/go-live.sh` the user runs Monday.
- **Branch:** `backlog/04-server-foundation`

### Item 5/6 — Keyword scraping (mission + JD)
- **Where:** new module `apps/desktopProbe/src/server/keywords/`
- **API:** `extractKeywords(text: string, kind: 'mission' | 'jd'): Promise<{ skills: string[]; tools: string[]; values: string[]; required: string[] }>`
- **Implementation:** OpenAI `gpt-4o-mini`, JSON mode, prompt-cached system prompt (per Anthropic pattern but for OpenAI: `prompt_cache_key`).
- **Mock mode:** when `F2A_AI_MOCK=1` or AI cap hit, returns deterministic keywords from a regex+stopword list.
- **Schema:** new column `links.keywords_jsonb`, `companies.mission_keywords_jsonb`.
- **Branch:** `backlog/05-06-keyword-scraping`

### Item 7/8 — Per-profile resume + cover letter builders
- **Schema:** new tables `resume_versions`, `cover_letter_versions`. `(id, profile_id fk, link_id fk, content_jsonb, model, created_at)`.
- **Builder:** takes (master_resume, master_cover_letter, link.keywords, company.mission_keywords) → renders to JSON content tree.
- **UI:** read-only viewer in filter profile page; "Regenerate" button.
- **Mock:** without master content, returns a synthetic JSON skeleton.
- **Branch:** `backlog/07-08-tailored-content`

### Item 9 — Master resume / cover letter (account-level)
- **Schema:** `account_master_resume`, `account_master_cover_letter` tables (one row per account, JSONB content + uploaded_filename + uploaded_at).
- **UI:** `/profile/master-content` page with upload + parse (PDF/DOCX → JSON via `mammoth`/`pdf-parse`).
- **Mock:** synthetic master content fixture for tests.
- **Branch:** `backlog/09-master-content`

### Item 11 — Approve via Pushover (stub)
- **State machine:** `pending_approval → approved → submitted` (submitted is no-op without item 10).
- **Pushover payload:** title `Apply to {company}?`, body = JD summary + tailored content URL, action URLs `/api/approve/{token}` and `/api/reject/{token}`.
- **Endpoint:** `apps/serverWebUI/app/api/approve/[token]/route.ts` flips state.
- **Branch:** `backlog/11-approval-flow`

### Item 12 — LinkedIn CSV import + enrichment
- **Where:** `apps/desktopProbe/src/pages/connections.tsx` + `apps/desktopProbe/src/server/connections/`
- **CSV parsing:** standard LinkedIn export format (First Name, Last Name, URL, Email Address, Company, Position, Connected On).
- **Enrichment:** for each contact, web search (Bing/DuckDuckGo HTML parse — no LinkedIn API) for `"{company}" linkedin company page` and `"{company}" official website`. Cache results in `companies` table.
- **Mock CSV:** `tests/fixtures/connections.sample.csv` with 50 rows of synthetic data.
- **Branch:** `backlog/12-linkedin-import`

---

## 6. Verification — `scripts/weekend-dry-run.sh`

Exit codes: 0 = pass, 1 = any check failed. Reads `--dry-run` flag (mocks transports). Pre-flight: assert local Docker Supabase stack is up (`supabase status`); skip cloud-touching steps. Sets `F2A_AI_MOCK=1`, `F2A_MOCK_SCRAPE=1`, `F2A_PUSHOVER_MOCK=1` for the duration. Each step is **gated**: if the package/script doesn't exist yet, that step is reported as `SKIP (not built)` and does not fail the run — but at least one step per built item must execute. Steps:

1. `pnpm install --frozen-lockfile`.
2. `npx nx run-many -t typecheck` (Nx-aware; new packages must register `project.json`).
3. `npx nx run-many -t lint`.
4. `npx nx run-many -t test`.
5. `cd apps/backend && supabase db reset --local` (local Docker only; preflight asserts not linked-cloud).
6. `cd apps/desktopProbe && pnpm typecheck` (no full Electron package — too slow for dry-run).
7. `[ -d apps/serverProbe ] && cd apps/serverProbe && pnpm build` (gated).
8. `[ -d apps/serverProbe ] && cd apps/serverProbe && F2A_MOCK_SCRAPE=1 timeout 30 pnpm start --headless --probe-once` (gated; uses fixture scrape).
9. `[ -d apps/serverWebUI ] && cd apps/serverWebUI && pnpm build` (gated).
10. `ssh -o BatchMode=yes -o ConnectTimeout=5 pi 'echo OK'` — connectivity only.
11. Repo-wide secret grep: `sk-`, `sk-proj-`, `pk_live_`, `service_role`, `AKIA[A-Z0-9]{16}`, `ghp_`, `-----BEGIN [A-Z ]*PRIVATE KEY`. Allowlist: `.env.example`, `tests/fixtures/`, `node_modules/`, `pnpm-lock.yaml`, `decisions*.md`, `spec.md`.

**Pass criteria:** every NON-skipped step exits 0. Skip-list summarized at end of run. Any non-skipped failure → fix and re-run.

---

## 7. Pipeline (per user's instruction)

1. **Devils-advocate loop** on this `spec.md` until zero new issues.
2. **Code review** on hardened spec.
3. **Plan-builder** produces `plan.md`.
4. **Build** per `plan.md` with parallel agents.
5. **Verify** with `scripts/weekend-dry-run.sh`.
6. **Per-item exec summary + devils-advocate + code-review** appended to `decisions.md`.

---

## 8. Final deliverables Monday

- One PR per backlog item against `master` (not auto-merged).
- `decisions.md` — full append-only log.
- `decisions-notion.md` — Notion-flavored mirror.
- `spec.md`, `plan.md` — for future reference.
- `deploy/pi/` — deploy scripts, NOT yet executed in apply mode.
- Working `scripts/weekend-dry-run.sh` — green.
- BLOCKERS list at top of `decisions.md` for user action (cloud migration drift, master resume content, real Pushover creds, real Connections CSV, Pi go-live decision, item 10 reactivation).

---

## 9. Hardening addendum (post-devils-advocate round 1)

Applied 2026-04-25. Modifies/refines §1–§8.

### 9.1 Item 4 (server foundation) refinements
- `apps/serverProbe` exposes `--probe-once` flag: performs ONE scan cycle, then exits 0. With `F2A_MOCK_SCRAPE=1`, scrapers read `tests/fixtures/scrape/*.json` instead of network. This is the contract the dry-run depends on.
- `apps/serverProbe/project.json` and `apps/serverWebUI/project.json` MUST be registered with Nx — verified by `npx nx show projects` listing them. Each defines `typecheck`, `lint`, `test`, `build` targets.
- `compose.standby.yaml` pins ALL image tags. Scope reduced to **Postgres-only** for the weekend (auth/rest/realtime deferred to a follow-up; documented as remainder).
- Pi mutation kill-switch: every script in `deploy/pi/` no-ops (prints `[DRY] would: <cmd>`) unless `F2A_PI_APPLY=1` is exported. Weekend run does NOT set this. User sets it Monday.
- Artifact transfer (if any): `rsync` over `ssh pi`, dest `/home/maadkal/f2a-builds/` (NOT `/opt/first2apply/` until bootstrap creates the system user). Compose files declare `profiles: [standby]` so a stray `docker compose up` cannot start them.
- `deploy/pi/rollback.sh` is the FIRST thing written and the FIRST thing tested (`bash -n`, then `--dry-run` execution).

### 9.2 Item 11 (approval flow) refinements
- Approval token = HMAC-SHA256 signed JSON `{job_id, action: 'approve'|'reject', exp: now+24h, jti: uuid}` with secret from `APPROVAL_HMAC_SECRET` env. Decoded and verified server-side.
- New table `approval_tokens (jti uuid pk, job_id, consumed_at timestamptz null, expires_at timestamptz)`. Reject if consumed or expired.
- Endpoint flips state machine; "submitted" remains a no-op stub (item 10 deferred).

### 9.3 AI budget enforcement (cross-cutting)
- New module `apps/desktopProbe/src/server/ai/budget.ts` (also imported by edge functions) exporting:
  - `assertWithinBudget(estimateTokensIn: number, model: string): void` — throws if projected cumulative > $20.
  - `recordSpend(tokensIn, tokensOut, model): void` — appends to `.f2a-ai-spend.json` (gitignored) AND to `decisions.md` as one auto-generated line.
- All AI call sites route through this. `F2A_AI_MOCK=1` forces deterministic regex-based fallback and records $0 spend.
- Per-call price table for `gpt-4o-mini`: $0.15/1M input, $0.60/1M output (April 2026). Hardcoded constants.

### 9.4 Items 5–9 dependency DAG (overrides BACKLOG order during build)
1. Tier A (parallel): items 1, 2, 3.
2. Tier B (after A): item 4 scaffolds (packages + Nx registration + rollback.sh).
3. Tier C (parallel, after B): items 5/6 (keywords), 9 (master content schema).
4. Tier D (after C): items 7/8 (tailored content — depend on keywords + master content).
5. Tier E (after D): item 11 (approval flow).
6. Tier F (parallel, anytime): item 12 (LinkedIn import, mock-fixture-only this weekend).

### 9.5 Item 12 (LinkedIn enrichment) — mock-only
- Enrichment is **mock-first**: `tests/fixtures/connections.enrichment.json` maps `companyName → {linkedin_url, website_url}`. Real fetcher exists behind `F2A_ENRICH_LIVE=1` flag but is NOT exercised by tests or dry-run.

### 9.6 Quiet-hours flusher (item 2) testability
- Dispatch interval is constructor-injectable (default 60_000ms; tests pass `100`).
- Window-check function is pure and tested separately for DST/midnight/tz.
- Uses `jest.useFakeTimers()` for flusher tests.

### 9.7 UI testing bar revision
- Replace "screenshot baseline" with: "TS compile + at least one React Testing Library shallow-render test for any new page". Screenshot infrastructure is out of scope this weekend.

### 9.8 Stop conditions tightened
- If a backlog item's Tier prerequisite has failed/skipped, that item is auto-skipped with reason logged. No silent partial builds that depend on missing modules.
