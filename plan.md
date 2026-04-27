# Weekend Build Plan — first2apply

**Generated:** 2026-04-25 (post devils-advocate round 1)
**Source:** `spec.md` (with §9 hardening addendum)
**Branch root:** `wip/pre-weekend-snapshot`
**Convention:** one branch + PR per item; no auto-merge.

---

## Scope reality check (read this first)

Spec lists 11 backlog items. Honest single-session capacity: **3 P0 items real, 4 P2 items as scaffolds, 2 items not started.** Documented as remainder in `weekend-report.md` per spec §1 disposition contract.

Disposition for THIS session:
- **Real, mergeable:** items 1, 3, dry-run script, rollback.sh, AI budget module.
- **Scaffold (branch + tests skeleton + TODO markers):** items 2 (quiet-hours migration + UI stub), 5/6 (keywords API stub + mock), 9 (master content schema stub).
- **Not started this session:** items 4 (server foundation — too large), 7, 8 (depend on 9), 11 (depends on 4), 12.
- **Explicitly deferred:** item 10 (auto-apply via Playwright — per spec §1 and Q12).

---

## Tier A — independent P0 (parallel-eligible)

### Plan-1: Item 1 — Explicit Save button on AI filter prompt
- **Branch:** `backlog/01-explicit-save-button` from `wip/pre-weekend-snapshot`.
- **File:** `apps/desktopProbe/src/pages/filters.tsx`.
- **Steps:**
  1. Read `filters.tsx` to find the prompt textarea + name field; identify autosave-on-blur handler.
  2. Add local `isDirty` state; track edits to prompt + name.
  3. Add `<Button>Save</Button>` at editor footer; `disabled={!isDirty}`; on click, call existing save API and `toast.success`.
  4. Remove the blur-autosave handler (or keep as backup — TBD per existing code shape).
  5. Add unit test `filters.dirty.test.tsx` for dirty-state hook (RTL).
- **DoD:** typecheck passes, lint passes, test passes, manual screenshot OK skipped (no screenshot infra).

### Plan-2: Item 3 — Pushover audit
- **Branch:** `backlog/03-pushover-audit`.
- **Steps:**
  1. `grep -rn "pushover\|Pushover" apps/ libraries/` to enumerate call sites.
  2. Write `docs/pushover-audit.md` with table: (file, function, payload shape, title pattern, body pattern, action URL, retry policy).
  3. If call sites diverge, add `apps/desktopProbe/src/server/notifications/pushover.ts`: typed `sendPushover(payload)` with mock transport when `F2A_PUSHOVER_MOCK=1`, exponential backoff (max 3, base 500ms), 429 respect.
  4. Add unit tests for backoff and mock transport.
- **DoD:** audit doc exists; helper exists OR documented as not-needed; tests pass.

### Plan-3: AI budget module (cross-cutting, blocks 5/6/7/8)
- **Branch:** `backlog/03b-ai-budget` (sibling to 03).
- **File:** `apps/desktopProbe/src/server/ai/budget.ts`.
- **API:** `assertWithinBudget(estIn, model)`, `recordSpend(in, out, model)`, both backed by `.f2a-ai-spend.json` (gitignored).
- **Tests:** unit, with stubbed fs.
- **DoD:** module exists, tests pass, `.gitignore` updated.

---

## Tier B — server foundation skeleton (item 4 partial)

### Plan-4: `deploy/pi/rollback.sh` + dry-run script
- **Branch:** `backlog/04-server-foundation` (scaffold only this session).
- **Steps:**
  1. Write `deploy/pi/rollback.sh` with `F2A_PI_APPLY` kill-switch. Defaults to print-only.
  2. Verify script via `bash -n` and `--dry-run` invocation locally.
  3. Write `scripts/weekend-dry-run.sh` per §6 with gating logic.
  4. Run dry-run; expect green or skips-only.
- **DoD:** scripts executable, dry-run exits 0.

---

## Tier C — scaffolds (items 2, 5/6, 9)

Each gets a branch with:
- Migration file (where applicable) — local-only, not pushed.
- Test skeleton with `it.todo()` markers.
- TODO comments referencing spec section.
- `BLOCKER.md` in branch listing what's missing.

### Plan-5: Item 2 scaffold — quiet hours
- Branch `backlog/02-quiet-hours`.
- Migration `2026XXXX_quiet_hours.sql` adds the three columns + `notification_queue` table per spec §5.
- `apps/desktopProbe/src/server/notifications/quietHours.ts` exporting pure `isInQuietHours(now, start, end, tz)` function with full tests (DST, midnight crossover).
- Flusher class skeleton with injectable interval (NOT wired to scheduler).
- Settings UI: `it.todo()`.

### Plan-6: Items 5/6 scaffold — keyword extraction
- Branch `backlog/05-06-keyword-scraping`.
- Module `apps/desktopProbe/src/server/keywords/index.ts` with `extractKeywords(text, kind)`.
- Mock implementation (regex+stopwords) is the default; real OpenAI path behind `F2A_AI_MOCK !== '1'`, gated by budget module.
- Migration adds `links.keywords_jsonb`, `companies.mission_keywords_jsonb`.
- Tests cover mock path only (deterministic).

### Plan-7: Item 9 scaffold — master content schema
- Branch `backlog/09-master-content`.
- Migration creates `accounts`, `account_members`, `account_master_resume`, `account_master_cover_letter` tables.
- No UI, no parser. README in branch describes Monday work.

---

## Tier D — NOT BUILT this session

| Item | Reason |
|------|--------|
| 4 (full server) | 8+ hours minimum; needs new Electron pkg, new Next.js pkg, Nx wiring, systemd units, compose file. Scaffold in Tier B only. |
| 7, 8 (tailored content) | Depend on 9 schema + 5/6 keywords; scaffold suffices. |
| 11 (approval flow) | Depends on item 4. |
| 12 (LinkedIn import) | Standalone but heavy (CSV parser, enrichment fixture, UI). Defer. |
| 10 (Playwright) | Explicitly deferred by user (Q12). |

These show in BACKLOG with status `NOT_STARTED — Monday handoff`.

---

## Dispatch order (sequential — not parallel for safety in single session)

1. Plan-3 (AI budget) — small, blocks downstream.
2. Plan-1 (item 1) — quickest win, flexes the build pipeline.
3. Plan-4 (rollback + dry-run) — gates everything.
4. Plan-2 (item 3 audit).
5. Plan-5, 6, 7 (scaffolds, only if time permits).

After each: commit on branch, log to decisions.md, run dry-run.

---

## Stop conditions (per spec §4)

- Any 3-retry failure on a step → skip, log, continue.
- Single-session time cap of ~4 hours of actual building → close out and write report.
- Dry-run going red → triage; if not fixable in 30 min, document as BLOCKER.
