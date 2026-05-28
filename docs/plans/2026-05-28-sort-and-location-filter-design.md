# Sort controls + Location filter — design

Date: 2026-05-28
Status: Approved, ready for implementation plan.

## Goal

Let the user (a) sort the Jobs list by date ascending or descending in addition to fit/score, and (b) filter the Jobs list by location — both ad-hoc via the funnel menu and durably via an AI Filter Profile so non-matching jobs never reach the New tab.

## Scope decisions

- **Posted-date sort is out of scope.** Jobs have no `posted_date` field. Adding it would require schema + 6+ parser changes (LinkedIn relative-time, Indeed, Glassdoor lossy, Dice missing, Greenhouse `updated_at` is misleading, custom LLM parser inconsistent), plus ongoing per-site maintenance. Defer until at least Indeed + LinkedIn are reliably capturing it.
- v1 sorts on `created_at` (detection date) only, plus existing fit/score modes.
- Menu-level location filter and profile-level location filter ship together — they share the bucket classifier and splitting would duplicate work.

## v1 components

### 1. Sort dropdown

Replace the four-button row (`Newest | Best fit | Score 10 | Score all`) with a single dropdown:

- Newest first (default; ORDER BY `created_at DESC`)
- Oldest first (ORDER BY `created_at ASC`)
- Best fit (client-side score desc, unscored sink — unchanged)
- Score 10 (unchanged)
- Score all (unchanged)

Asc/desc executed server-side via a new `jobs_sort` param on `list_jobs`. Fit/score modes still client-side reorder of the loaded page.

### 2. Location bucket classifier (shared)

A pure helper:

```ts
type LocationBucket = 'remote' | 'hybrid' | 'onsite' | 'unspecified';
function classifyLocation(loc?: string | null): LocationBucket;
```

Rules, evaluated in order:
1. `loc` empty/null → `unspecified`
2. matches `/\bremote\b/i` → `remote`
3. matches `/\bhybrid\b/i` → `hybrid`
4. otherwise → `onsite`

Lives in `libraries/core/src/` so it's importable from both the desktop UI and edge functions.

### 3. Funnel menu — Location section

Add a fourth submenu item after Labels:

- **Work arrangement** — 4 checkboxes (Remote / Hybrid / On-site / Unspecified). Multi-select, OR across checked.
- **Location contains** — free-text input, case-insensitive substring match on `Job.location`.

Combined with bucket selection via AND.

`JobFiltersType` gains:
```ts
locationBuckets: LocationBucket[];
locationContains: string;
```

### 4. Server-side wiring

New params on `list_jobs` and `count_jobs` RPCs:
- `jobs_sort text` — one of the five sort modes above. Default `'detected_desc'`.
- `jobs_location_buckets text[]` — when non-empty, restrict to jobs whose classified bucket is in the set.
- `jobs_location_contains text` — when non-empty, `location ILIKE '%' || $ || '%'`.

Bucket classification in SQL mirrors the TS helper:
```sql
CASE
  WHEN location IS NULL OR btrim(location) = '' THEN 'unspecified'
  WHEN location ~* '\mremote\M' THEN 'remote'
  WHEN location ~* '\mhybrid\M' THEN 'hybrid'
  ELSE 'onsite'
END
```

`listJobs` in `libraries/ui/src/lib/supabaseApi.ts` accepts and forwards the new params. URL state in `jobTabsContent.tsx` (`?status=…&search=…&site_ids=…`) extended with `&sort=…&loc_buckets=…&loc_contains=…`.

### 5. AI Filter Profile — Location preferences

Schema additions to `ai_filter_profiles`:
```sql
location_buckets   text[] null
location_contains  text[] null
```

Editor (apps/desktopProbe/src/pages/filters.tsx) gains a `<LocationPreferences>` block between the ChatGPT prompt textarea and the Blacklisted companies block:

- Work arrangement: 4 checkboxes (Remote / Hybrid / On-site / Unspecified).
- Location contains: chip-list multi-input. Each chip is a free-text fragment matched case-insensitive substring; OR across chips.

Empty arrays = no constraint on that dimension.

`AiFilterProfile` type and `Insert`/`Update` shapes extended accordingly.

### 6. Scan-time enforcement

In `apps/backend/supabase/functions/scan-urls/index.ts`, after `parseJobsListUrl` returns and before AI prompt evaluation, apply the active profile's location rules:

- For each parsed job, classify its location.
- Fail if: `location_buckets` non-empty AND bucket not in set, OR `location_contains` non-empty AND none of the entries appear in `location.toLowerCase()`.
- Failed jobs persisted with `status='excluded_by_advanced_matching'` and `exclude_reason='location_mismatch: <bucket> / <location>'`. They show up in the existing Filtered out tab with reason chip.

Helper `filterJobsByLocation(jobs, profile)` lives in `apps/backend/supabase/functions/_shared/` and uses the same classifier (duplicated to Deno — small enough function to inline rather than building a shared package boundary).

## Out of scope

- Posted-date sort (see Scope decisions).
- City/region geocoding or normalization beyond bucket + substring.
- Per-search location overrides (use the profile or the ad-hoc menu).
- Backfilling existing jobs' `excluded_by_advanced_matching` based on a newly-set profile location rule — rules only apply to future scans.

## Files touched (summary)

- `apps/backend/supabase/migrations/<new>.sql` — `ai_filter_profiles` columns + `list_jobs` / `count_jobs` rewrite
- `apps/backend/supabase/functions/scan-urls/index.ts` — call `filterJobsByLocation`
- `apps/backend/supabase/functions/_shared/filterJobsByLocation.ts` — new
- `libraries/core/src/types.ts` — `AiFilterProfile`, `JobFiltersType`-equivalent shapes
- `libraries/core/src/classifyLocation.ts` — new
- `libraries/ui/src/lib/supabaseApi.ts` — `listJobs` params
- `apps/desktopProbe/src/components/home/jobTabsContent.tsx` — sort dropdown, URL state
- `apps/desktopProbe/src/components/home/jobFilters/jobFiltersMenu.tsx` — Location submenu
- `apps/desktopProbe/src/components/home/jobFilters.tsx` — pass-through
- `apps/desktopProbe/src/pages/filters.tsx` — `<LocationPreferences>` in profile editor
