# Unify Supabase types: hand-written `DbSchema` → generated `Database`

**Date:** 2026-04-28
**Status:** Planned (follow-up to PR 5 / server-probe project)

## Problem

`libraries/ui` and `apps/backend` parameterize `SupabaseClient` with a
hand-written `DbSchema` from `@first2apply/core`. Newer
`@supabase/supabase-js` versions tightened the `GenericSchema`/`GenericTable`
constraint such that each `Tables[name]['Row']` must extend
`Record<string, unknown>`. The hand-written `Row` shapes (`Job`, `Link`,
`AiFilterProfile`, `UserSettings`, …) are interfaces/types without an index
signature, so the constraint fails and supabase-js collapses table operations
to `never`. That produces ~10 cascading TS errors in
`libraries/ui/src/lib/supabaseApi.ts` and the edge functions.

This is why `@first2apply/ui:typecheck`/`build` and
`@first2apply/backend:typecheck` fail on master and are excluded from the
PR 5 CI workflows.

## Compounding factors

- The workspace currently resolves four different `@supabase/supabase-js`
  versions (2.39.0, 2.45.4, 2.76.1, 2.95.3). Older ones have the looser
  constraint and silently mask the issue.
- A real generated `Database` type already exists at
  `libraries/core/src/database.types.ts` — it satisfies the constraints —
  but the apps don't use it.
- `Database` (snake_case, generated from the live schema) and `DbSchema`
  (mixed case, hand-written) have diverged. `Job.siteId` vs
  `jobs.Row.site_id`, etc.

## Proposed approach

1. **Pin one supabase-js version** at the workspace root. Pick the version
   currently used by serverProbe (^2.45.4) or bump everything to ^2.95.x —
   prefer the latter so we're on supported releases.
2. **Replace `DbSchema` with `Database`.** Re-export `Database` from
   `@first2apply/core` (or alias `DbSchema = Database`) and update every
   `SupabaseClient<DbSchema>` reference. Delete the hand-written
   `DbSchema` once nothing imports it.
3. **Reconcile field names.** Where domain types (`Job`, `Link`, etc.) use
   camelCase but the DB rows are snake_case, either:
   a. Rename domain fields to match snake_case (preferred — less mapping),
      or
   b. Keep the mapping layer in `supabaseApi` but update its types so the
      compiler can verify it.
4. **Re-run `@first2apply/ui` and `@first2apply/backend` typecheck.** Fix
   any remaining errors.
5. **Expand CI** in `.github/workflows/ci.yml`:
   - Add `@first2apply/ui` and `@first2apply/backend` to the typecheck
     `--projects` list.
   - Optionally widen the test job once those projects gain real tests.

## Out of scope

- Refactoring the desktop renderer to consume the unified types beyond
  what the typecheck demands.
- Touching the household fork's edge-function set beyond making
  `pnpm -F @first2apply/backend typecheck` pass.

## Verification

- `npx nx run-many -t typecheck` clean across all projects.
- `npx nx run-many -t build` clean (currently `@first2apply/ui:build`
  fails identically).
- CI workflow updated and green on a sample PR.
