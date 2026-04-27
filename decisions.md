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
