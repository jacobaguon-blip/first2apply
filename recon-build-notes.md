# recon/master-clean build notes

## Discrepancies vs the 10-commit plan

The plan as written contains an internal contradiction:

1. The **per-commit instructions** for commit #1 explicitly direct adding two
   migrations from `chore/migration-drift-recovery` that **do not exist on master**:
   - `apps/backend/supabase/migrations/20260424120000_quiet_hours.sql`
   - `apps/backend/supabase/migrations/20260424120001_claim_summary_send.sql`

2. The **per-commit file lists** intentionally exclude four files that **do exist on master**:
   - `CHANGELOG.md` (excluded per audit — auto-commit noise)
   - `MONDAY-STATUS.md` (not listed in any of the 10 commits)
   - `apps/backend/supabase/functions/_shared/customJobsParser.ts` (not listed)
   - `master-reconciliation-audit.md` (not listed — it is the audit doc itself)

3. The **end-state goal** demands `git diff master..recon/master-clean` be empty
   (identical tree as master).

These cannot all be simultaneously satisfied. To honor the end-state goal
(identical tree) — which the plan calls out as the primary success criterion
and provides explicit fallback for ("append an 11th commit `chore: align with
local master tree`") — an 11th commit was added that:

- restores the four excluded master files
- removes the two cloud-recovery migrations (since they are not on master)

Result: `git diff master..recon/master-clean` is empty. 11 commits atop
`origin/master` (7e97a90) instead of the planned 10.

## Note on cloud-recovery migrations

The two `20260424120*.sql` recovery migrations remain available on
`chore/migration-drift-recovery` and were also briefly present in this branch
between commit 1 (`c3fe7dc`) and the alignment commit 11 (`1db0a13`). They are
NOT lost — they live on the recovery branch.

If the intent was to keep them on `recon/master-clean` and let master diverge,
the alignment commit can be reverted before opening the PR.
