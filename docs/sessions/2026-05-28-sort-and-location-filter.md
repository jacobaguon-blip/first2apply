# 2026-05-28 — Sort dropdown + Location filter

**Outcome**: Implemented sort-by-date (Newest/Oldest) and Location filtering for the Jobs list — both ad-hoc via the funnel menu and durably via AI Filter Profile rules. Branch `feature/sort-and-location-filter` ready for smoke testing.

## Original Issue
User wants to sort jobs by date and filter by location. Screenshot showed the Jobs list with the funnel menu open exposing Job Boards / Searches / Labels — no Location, no sort selector.

## Follow-up Issues
- Posted-date sort scope was too costly (6+ parsers, no `posted_date` field) — deferred from v1.
- Task 4 missed the Electron IPC layer; folded into Task 6 by the implementer.
- Task 7 plan said "edit scan-urls"; actual exclusion entrypoint is `_shared/advancedMatching.ts`. Revised task accordingly, which also eliminated the planned Deno mirror of `classifyLocation`.

## Completed Tasks
- [x] Design doc `docs/plans/2026-05-28-sort-and-location-filter-design.md`
- [x] Implementation plan `docs/plans/2026-05-28-sort-and-location-filter.md`
- [x] Worktree `.worktrees/sort-and-location-filter` on `feature/sort-and-location-filter`
- [x] Task 1: `classifyLocation` helper in `@first2apply/core` (7 jest tests, JSDoc mirror contract)
- [x] Task 2: SQL migration `20260528000000_sort_and_location.sql` (list_jobs + count_jobs + ai_filter_profiles + classify_job_location + cursor-reset contract docs)
- [x] Task 3: `JobSortMode` + location fields on `AiFilterProfile`
- [x] Task 4: `listJobs` API + IPC wiring
- [x] Task 5: Funnel menu Location section (`applyPatch` refactor, prop-sync useEffect, narrowed types)
- [x] Task 6: Sort dropdown + URL state (allowlist-validated)
- [x] Task 7: `evaluateLocation` step in advancedMatching pipeline
- [x] Task 8: `<LocationPreferences>` in AI Filter Profile editor
- [x] Task 9: CLAUDE.md jump-table update

## Skills Used
- `superpowers:using-superpowers`
- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:subagent-driven-development`
- `superpowers:using-git-worktrees`
- `superpowers:code-reviewer` (per-task)
- `summary`

## Key Findings
- No `posted_date` on `Job` — deferred posted-date sort indefinitely.
- Three-mirror plan for `classifyLocation` collapsed to two (TS + SQL); Deno edge fn imports from `@first2apply/core` directly.
- Keyset cursor (`id!updated_at`) is sort-direction-sensitive; callers must reset on toggle. Contract documented inline in the migration.
- Husky hook auto-creates paired `changelog:` commits.

## Current State
- Branch ready for manual smoke; not pushed, not merged.
- Migration applied to local Supabase only.

## Next Steps
- [→ session-doc only] Manual smoke: reload preserves sort.
- [→ session-doc only] Manual smoke: reload preserves location filter.
- [→ session-doc only] Manual smoke: AI profile location-only exclusion lands in Filtered Out with `location_mismatch:`.
- [→ P1] Merge `feature/sort-and-location-filter` → `master`, apply migration to cloud Supabase, deploy desktop.
- [→ P3] Posted-date sort behind feature flag for Indeed + LinkedIn only.
- [→ P3] Extract `buildJobsUrl(params)` helper in `jobTabsContent.tsx`.
- [→ P3] `ProfileFieldPatch` type alias to dedupe `Pick<>` sites in `filters.tsx`.
- [→ P3] Functional index on `classify_job_location(location)` if bucket filtering becomes hot.

## Session Stats
- Turns: ~50
- Tokens: ~600k estimated
- Estimated cost: ~$15 on Opus pricing
