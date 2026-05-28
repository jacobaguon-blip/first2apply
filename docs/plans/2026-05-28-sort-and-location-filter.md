# Sort dropdown + Location filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a sort dropdown (Newest/Oldest first + existing Best fit/Score modes) and a Location filter that works both ad-hoc via the funnel menu and durably via AI Filter Profiles, so non-matching jobs are excluded at scan time.

**Architecture:** Shared `classifyLocation` helper in `@first2apply/core` used by client filter UI, server `list_jobs` SQL, and the `scan-urls` edge function. Sort + location params extend the existing `list_jobs` / `count_jobs` Postgres RPCs (keyset pagination preserved). Profile-level location preferences add two columns to `ai_filter_profiles` and a `<LocationPreferences>` block in the profile editor.

**Tech Stack:** TypeScript, React (Electron desktop), pnpm + Nx monorepo, Supabase (Postgres + Deno edge functions), shadcn/ui components.

**Design doc:** `docs/plans/2026-05-28-sort-and-location-filter-design.md`

**Note on date column:** existing `list_jobs` paginates on `updated_at` (keyset cursor `id!updated_at`). v1 sort uses `updated_at` for both Newest/Oldest to preserve cursor compatibility. UI label is "Newest" / "Oldest" — users don't need to know the column name.

---

### Task 1: `classifyLocation` helper (shared, pure)

**Files:**
- Create: `libraries/core/src/classifyLocation.ts`
- Create: `libraries/core/src/__tests__/classifyLocation.test.ts`
- Modify: `libraries/core/src/index.ts` (add export)

**Step 1: Write the failing test**

```ts
// libraries/core/src/__tests__/classifyLocation.test.ts
import { describe, it, expect } from 'vitest';
import { classifyLocation, LOCATION_BUCKETS } from '../classifyLocation';

describe('classifyLocation', () => {
  it('returns unspecified for null/empty/whitespace', () => {
    expect(classifyLocation(null)).toBe('unspecified');
    expect(classifyLocation(undefined)).toBe('unspecified');
    expect(classifyLocation('')).toBe('unspecified');
    expect(classifyLocation('   ')).toBe('unspecified');
  });

  it('detects remote (case-insensitive, word boundary)', () => {
    expect(classifyLocation('Remote')).toBe('remote');
    expect(classifyLocation('Philippines - Remote')).toBe('remote');
    expect(classifyLocation('REMOTE - US')).toBe('remote');
    // word boundary: "Remotely" should not match
    expect(classifyLocation('Remotely managed team in Berlin')).toBe('onsite');
  });

  it('detects hybrid', () => {
    expect(classifyLocation('Hybrid - San Francisco')).toBe('hybrid');
    expect(classifyLocation('London (Hybrid)')).toBe('hybrid');
  });

  it('remote wins over hybrid when both appear', () => {
    expect(classifyLocation('Remote / Hybrid')).toBe('remote');
  });

  it('defaults to onsite for plain city strings', () => {
    expect(classifyLocation('Dongguan, China')).toBe('onsite');
    expect(classifyLocation('San Francisco, CA')).toBe('onsite');
  });

  it('exports the canonical bucket list', () => {
    expect(LOCATION_BUCKETS).toEqual(['remote', 'hybrid', 'onsite', 'unspecified']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @first2apply/core test -- classifyLocation`
Expected: FAIL with "Cannot find module '../classifyLocation'".

**Step 3: Write minimal implementation**

```ts
// libraries/core/src/classifyLocation.ts
export const LOCATION_BUCKETS = ['remote', 'hybrid', 'onsite', 'unspecified'] as const;
export type LocationBucket = (typeof LOCATION_BUCKETS)[number];

export function classifyLocation(loc?: string | null): LocationBucket {
  if (!loc || !loc.trim()) return 'unspecified';
  if (/\bremote\b/i.test(loc)) return 'remote';
  if (/\bhybrid\b/i.test(loc)) return 'hybrid';
  return 'onsite';
}
```

Add `export * from './classifyLocation';` to `libraries/core/src/index.ts`.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @first2apply/core test -- classifyLocation`
Expected: PASS, 6 tests green.

**Step 5: Commit**

```bash
git add libraries/core/src/classifyLocation.ts libraries/core/src/__tests__/classifyLocation.test.ts libraries/core/src/index.ts
git commit -m "feat(core): add classifyLocation helper for location bucketing"
```

---

### Task 2: SQL migration — sort param, location filter params, AI profile columns

**Files:**
- Create: `apps/backend/supabase/migrations/20260528000000_sort_and_location.sql`

**Step 1: Write the migration**

```sql
-- 20260528000000_sort_and_location.sql

-- 1. AI Filter Profile location preferences
alter table public.ai_filter_profiles
  add column if not exists location_buckets  text[] null,
  add column if not exists location_contains text[] null;

-- 2. SQL classifier mirroring libraries/core/src/classifyLocation.ts.
--    Word-boundary regex via \m \M anchors.
create or replace function public.classify_job_location(loc text)
returns text language sql immutable as $$
  select case
    when loc is null or btrim(loc) = '' then 'unspecified'
    when loc ~* '\mremote\M' then 'remote'
    when loc ~* '\mhybrid\M' then 'hybrid'
    else 'onsite'
  end;
$$;

-- 3. list_jobs: add sort + location params. Keep existing cursor format
--    (id!updated_at). For both newest_first and oldest_first we paginate on
--    (updated_at, id); direction of comparison flips with sort mode.
create or replace function list_jobs(
    jobs_status "Job Status",
    jobs_after text,
    jobs_page_size integer,
    jobs_search text default null,
    jobs_site_ids integer[] default null,
    jobs_link_ids integer[] default null,
    jobs_labels text[] default null,
    jobs_sort text default 'newest_first',
    jobs_location_buckets text[] default null,
    jobs_location_contains text default null
)
returns setof jobs as $$
declare
  after_id integer;
  after_updated_at timestamp;
  ascending boolean := (jobs_sort = 'oldest_first');
begin
  if jobs_after is not null then
    after_id := split_part(jobs_after, '!', 1)::integer;
    after_updated_at := split_part(jobs_after, '!', 2)::timestamp;
  end if;

  return query
  select *
  from jobs
  where user_id = auth.uid()
    and status = jobs_status
    and (
      jobs_after is null or (
        case
          when ascending then (updated_at, id) > (after_updated_at, after_id)
          else                (updated_at, id) < (after_updated_at, after_id)
        end
      )
    )
    and (array_length(jobs_site_ids, 1) is null or "siteId" = any(jobs_site_ids))
    and (array_length(jobs_link_ids, 1) is null or link_id = any(jobs_link_ids))
    and (array_length(jobs_labels, 1) is null or labels && jobs_labels)
    and (jobs_search is null or job_search_vector @@ plainto_tsquery('english', jobs_search))
    and (
      array_length(jobs_location_buckets, 1) is null
      or public.classify_job_location(location) = any(jobs_location_buckets)
    )
    and (
      jobs_location_contains is null
      or btrim(jobs_location_contains) = ''
      or location ilike '%' || jobs_location_contains || '%'
    )
  order by
    case when ascending then updated_at end asc nulls last,
    case when ascending then id end asc,
    case when not ascending then updated_at end desc nulls last,
    case when not ascending then id end desc
  limit jobs_page_size;
end; $$
language plpgsql;

-- 4. count_jobs: same location filters (sort irrelevant for counts).
create or replace function count_jobs(
    jobs_status "Job Status" default null,
    jobs_search text default null,
    jobs_site_ids integer[] default null,
    jobs_link_ids integer[] default null,
    jobs_labels text[] default null,
    jobs_location_buckets text[] default null,
    jobs_location_contains text default null
)
returns table(status "Job Status", job_count bigint) as $$
begin
  return query
  select j.status, count(*) as job_count
  from jobs j
  where j.user_id = auth.uid()
    and (jobs_status is null or j.status = jobs_status)
    and (array_length(jobs_site_ids, 1) is null or j."siteId" = any(jobs_site_ids))
    and (array_length(jobs_link_ids, 1) is null or j.link_id = any(jobs_link_ids))
    and (array_length(jobs_labels, 1) is null or j.labels && jobs_labels)
    and (jobs_search is null or j.job_search_vector @@ plainto_tsquery('english', jobs_search))
    and (
      array_length(jobs_location_buckets, 1) is null
      or public.classify_job_location(j.location) = any(jobs_location_buckets)
    )
    and (
      jobs_location_contains is null
      or btrim(jobs_location_contains) = ''
      or j.location ilike '%' || jobs_location_contains || '%'
    )
  group by j.status;
end; $$
language plpgsql;
```

> Before writing, open `apps/backend/supabase/migrations/20260418000000_initial_schema.sql:351-380` and copy the full original `count_jobs` body to verify the column references match (especially `j.status`, `j."siteId"` quoting). Only the WHERE additions and signature change.

**Step 2: Apply migration locally**

Run: `pnpm up` (if not already running), then `pnpm --filter @first2apply/backend exec supabase db reset` OR `supabase migration up` from `apps/backend/supabase/`.
Expected: migration applies cleanly, no errors.

**Step 3: Smoke-test the SQL**

In `supabase studio` SQL editor (or psql):

```sql
select public.classify_job_location('Philippines - Remote'); -- remote
select public.classify_job_location('Hybrid - SF');          -- hybrid
select public.classify_job_location('Dongguan, China');      -- onsite
select public.classify_job_location(null);                   -- unspecified

select count(*) from list_jobs('new', null, 5, null, null, null, null, 'oldest_first', null, null);
select count(*) from list_jobs('new', null, 5, null, null, null, null, 'newest_first', array['remote'], null);
```

Expected: classifier returns correct buckets; list_jobs returns rows without error.

**Step 4: Commit**

```bash
git add apps/backend/supabase/migrations/20260528000000_sort_and_location.sql
git commit -m "feat(backend): list_jobs sort + location params, ai profile location columns"
```

---

### Task 3: TypeScript types — `AiFilterProfile`, sort + location

**Files:**
- Modify: `libraries/core/src/types.ts`

**Step 1: Locate `AiFilterProfile`**

Run: `grep -n "AiFilterProfile\b" libraries/core/src/types.ts`
Find the `export type AiFilterProfile = { … }` declaration.

**Step 2: Add the two columns to the type**

```ts
// libraries/core/src/types.ts — inside AiFilterProfile
location_buckets: LocationBucket[] | null;
location_contains: string[] | null;
```

Import `LocationBucket` at the top: `import type { LocationBucket } from './classifyLocation';` (or re-use the existing intra-module path).

**Step 3: Add the sort mode union (top-level export)**

```ts
export const JOB_SORT_MODES = ['newest_first', 'oldest_first'] as const;
export type JobSortMode = (typeof JOB_SORT_MODES)[number];
```

**Step 4: Typecheck**

Run: `pnpm --filter @first2apply/core typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add libraries/core/src/types.ts
git commit -m "feat(core): add JobSortMode + location fields on AiFilterProfile"
```

---

### Task 4: `listJobs` / `countJobs` client wiring

**Files:**
- Modify: `libraries/ui/src/lib/supabaseApi.ts:285-340`

**Step 1: Extend `listJobs` signature**

Add to the destructured options object:

```ts
sort = 'newest_first' as JobSortMode,
locationBuckets,         // LocationBucket[] | undefined
locationContains,        // string | undefined
```

Add to the type annotation:

```ts
sort?: JobSortMode
locationBuckets?: LocationBucket[]
locationContains?: string
```

**Step 2: Pass to RPC calls**

```ts
const jobs_location_buckets =
  locationBuckets && locationBuckets.length > 0 ? locationBuckets : undefined;
const jobs_location_contains =
  locationContains && locationContains.trim() ? locationContains.trim() : undefined;

// inside the list_jobs rpc call:
jobs_sort: sort,
jobs_location_buckets,
jobs_location_contains,

// inside the count_jobs rpc call:
jobs_location_buckets,
jobs_location_contains,
```

Import `JobSortMode` and `LocationBucket` from `@first2apply/core`.

**Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

**Step 4: Commit**

```bash
git add libraries/ui/src/lib/supabaseApi.ts
git commit -m "feat(ui): listJobs accepts sort + location params"
```

---

### Task 5: Funnel menu — Location section

**Files:**
- Modify: `apps/desktopProbe/src/components/home/jobFilters/jobFiltersMenu.tsx`
- Modify: `apps/desktopProbe/src/components/home/jobFilters.tsx`

**Step 1: Extend `JobFiltersType`**

In `jobFiltersMenu.tsx` near the existing type:

```ts
import { LocationBucket, LOCATION_BUCKETS } from '@first2apply/core';

export type JobFiltersType = {
  sites: number[];
  links: number[];
  labels: string[];
  locationBuckets: LocationBucket[];
  locationContains: string;
};
```

**Step 2: Update `jobFilters.tsx` default state**

```ts
const [filters, setFilters] = useState<JobFiltersType>({
  sites: [],
  links: [],
  labels: [],
  locationBuckets: [],
  locationContains: '',
});
```

Update the `setFilters`/`onApplyFilters` plumbing — every call inside `jobFiltersMenu.tsx` that currently spreads `{ sites, links, labels }` must also forward `locationBuckets` and `locationContains`. The easiest refactor: replace each three-field call with a `(patch: Partial<JobFiltersType>) => onApplyFilters({ ...filtersFromProps, ...patch })` helper at the top of the menu component.

**Step 3: Add the Location DropdownMenuSub**

After the existing Labels submenu in `jobFiltersMenu.tsx`, mirroring the same pattern (DropdownMenuSub → DropdownMenuSubTrigger "Location" → DropdownMenuSubContent):

```tsx
<DropdownMenuSub>
  <DropdownMenuSubTrigger>Location</DropdownMenuSubTrigger>
  <DropdownMenuSubContent>
    <DropdownMenuLabel>Work arrangement</DropdownMenuLabel>
    {LOCATION_BUCKETS.map((b) => (
      <DropdownMenuCheckboxItem
        key={b}
        checked={selectedLocationBuckets.includes(b)}
        onCheckedChange={(checked) => {
          const next = checked
            ? [...selectedLocationBuckets, b]
            : selectedLocationBuckets.filter((x) => x !== b);
          applyPatch({ locationBuckets: next });
        }}
        onSelect={(e) => e.preventDefault()}
      >
        {b[0].toUpperCase() + b.slice(1)}
      </DropdownMenuCheckboxItem>
    ))}

    <DropdownMenuSeparator />
    <DropdownMenuLabel>Location contains</DropdownMenuLabel>
    <div className="px-2 py-1">
      <Input
        placeholder="e.g. Philippines"
        value={selectedLocationContains}
        onChange={(e) => applyPatch({ locationContains: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
        className="h-8 text-xs"
      />
    </div>
  </DropdownMenuSubContent>
</DropdownMenuSub>
```

Add `selectedLocationBuckets` and `selectedLocationContains` to the component's props (alongside `selectedSites`/`selectedLinks`/`selectedLabels`) and wire them up in `jobFilters.tsx`.

**Step 4: Extend Remove Filters to clear new fields**

The `onClearAll` (line 100 area) must clear `locationBuckets: []` and `locationContains: ''` too.

**Step 5: Manual smoke**

Run: `pnpm dev` (or `npx nx run desktopProbe:dev`).
Open the desktop app, open the funnel menu, verify:
- Location submenu appears under Labels.
- Toggling a bucket immediately updates the list (will need Task 6 done for end-to-end query, but UI should at least not crash).

**Step 6: Commit**

```bash
git add apps/desktopProbe/src/components/home/jobFilters/jobFiltersMenu.tsx \
        apps/desktopProbe/src/components/home/jobFilters.tsx
git commit -m "feat(desktop): location section in funnel filter menu"
```

---

### Task 6: Sort dropdown + URL state in `jobTabsContent.tsx`

**Files:**
- Modify: `apps/desktopProbe/src/components/home/jobTabsContent.tsx`

**Step 1: Replace `sortMode` state with the unified union**

```ts
type SortMode = 'newest_first' | 'oldest_first' | 'fit' | 'score_10' | 'score_all';
const [sortMode, setSortMode] = useState<SortMode>('newest_first');
```

Read `sort` from URL query at top of component (same place `siteIds` / `linkIds` / `labels` are parsed).

**Step 2: Wire sort to `listJobs`**

In the load effect (around line 172):

```ts
const serverSort: JobSortMode =
  sortMode === 'oldest_first' ? 'oldest_first' : 'newest_first';

const result = await listJobs({
  status, search, siteIds, linkIds, labels,
  sort: serverSort,
  locationBuckets,
  locationContains,
  limit: JOB_BATCH_SIZE,
});
```

`locationBuckets` and `locationContains` come from the URL (Task 5 wires them through `onSearchJobs`).

**Step 3: Replace the four-button row with a `<DropdownMenu>` sort selector**

Around line 426–461, replace the Newest/Best fit/Score 10/Score all buttons with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
      Sort: {SORT_LABELS[sortMode]}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuRadioGroup value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
      <DropdownMenuRadioItem value="newest_first">Newest first</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="oldest_first">Oldest first</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="fit">Best fit</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenuContent>
</DropdownMenu>
```

Keep the "Score 10" / "Score all" buttons separate (they're actions, not sorts).

`SORT_LABELS` is a local const map.

**Step 4: Update `visibleJobs` memo**

```ts
const visibleJobs = useMemo(() => {
  if (sortMode !== 'fit') return listing.jobs; // server already ordered for newest/oldest
  return [...listing.jobs].sort((a, b) => {
    const sa = evaluations.get(a.id)?.score ?? -1;
    const sb = evaluations.get(b.id)?.score ?? -1;
    return sb - sa;
  });
}, [listing.jobs, sortMode, evaluations]);
```

**Step 5: Update `onSearchJobs` and URL**

```ts
const onSearchJobs = ({ search, filters }: { search: string; filters: JobFiltersType }) => {
  navigate(
    `?status=${status}` +
    `&search=${search}` +
    `&site_ids=${filters.sites.join(',')}` +
    `&link_ids=${filters.links.join(',')}` +
    `&labels=${filters.labels.join(',')}` +
    `&loc_buckets=${filters.locationBuckets.join(',')}` +
    `&loc_contains=${encodeURIComponent(filters.locationContains)}` +
    `&sort=${sortMode}`
  );
};
```

When `sortMode` changes, also `navigate(…)` with the new sort so reloads keep the choice (mirror the pattern used for status hotkeys).

**Step 6: Typecheck + smoke**

Run: `pnpm typecheck` then `pnpm dev`.
Verify:
- Switching to "Oldest first" reorders the list (server-side; check Network/console — query param visible).
- Toggling location bucket "Remote" reduces the list to remote-tagged jobs.
- Typing "Philippines" in the contains box filters further.
- Closing+reopening the funnel preserves selections; reload preserves them (URL state).

**Step 7: Commit**

```bash
git add apps/desktopProbe/src/components/home/jobTabsContent.tsx
git commit -m "feat(desktop): sort dropdown + location URL state in jobs view"
```

---

### Task 7: Edge function — `filterJobsByLocation` + `scan-urls` integration

**Files:**
- Create: `apps/backend/supabase/functions/_shared/filterJobsByLocation.ts`
- Modify: `apps/backend/supabase/functions/scan-urls/index.ts`

**Step 1: Write the helper (and a small inline self-test)**

```ts
// apps/backend/supabase/functions/_shared/filterJobsByLocation.ts
import type { ParsedJob } from './parsers/parserTypes.ts';

export type LocationBucket = 'remote' | 'hybrid' | 'onsite' | 'unspecified';

export function classifyLocation(loc?: string | null): LocationBucket {
  if (!loc || !loc.trim()) return 'unspecified';
  if (/\bremote\b/i.test(loc)) return 'remote';
  if (/\bhybrid\b/i.test(loc)) return 'hybrid';
  return 'onsite';
}

export type LocationProfileRules = {
  location_buckets: LocationBucket[] | null;
  location_contains: string[] | null;
};

export type LocationFilterDecision =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluateLocation(
  job: Pick<ParsedJob, 'location'>,
  rules: LocationProfileRules,
): LocationFilterDecision {
  const bucket = classifyLocation(job.location);

  if (rules.location_buckets && rules.location_buckets.length > 0) {
    if (!rules.location_buckets.includes(bucket)) {
      return { ok: false, reason: `location_mismatch: bucket=${bucket} loc="${job.location ?? ''}"` };
    }
  }

  if (rules.location_contains && rules.location_contains.length > 0) {
    const hay = (job.location ?? '').toLowerCase();
    const matches = rules.location_contains.some((needle) =>
      hay.includes(needle.toLowerCase()),
    );
    if (!matches) {
      return { ok: false, reason: `location_mismatch: no "contains" match (loc="${job.location ?? ''}")` };
    }
  }

  return { ok: true };
}
```

Reason: Deno edge functions can't directly import from `libraries/core` without bundling. Duplicating ~15 lines is cheaper than wiring a shared package boundary. Both copies are covered by tests (Task 1 + manual SQL smoke in Task 2 + this file's mirror).

**Step 2: Apply in `scan-urls`**

Find where `parseJobsListUrl` returns `jobs` (around line 192). After parsing, before AI prompt evaluation:

```ts
// Load the active AI Filter Profile for this link (if any). Existing scan-urls
// code already resolves this — re-use the same lookup; do NOT re-fetch.
const locRules = activeProfile
  ? { location_buckets: activeProfile.location_buckets, location_contains: activeProfile.location_contains }
  : { location_buckets: null, location_contains: null };

const hasLocRules =
  (locRules.location_buckets && locRules.location_buckets.length > 0) ||
  (locRules.location_contains && locRules.location_contains.length > 0);

const passingJobs: typeof jobs = [];
const locationExcluded: Array<{ job: typeof jobs[number]; reason: string }> = [];

if (hasLocRules) {
  for (const job of jobs) {
    const decision = evaluateLocation(job, locRules);
    if (decision.ok) passingJobs.push(job);
    else locationExcluded.push({ job, reason: decision.reason });
  }
} else {
  passingJobs.push(...jobs);
}
```

Then in the existing persistence block that already writes excluded-by-advanced-matching rows, add a parallel insert for `locationExcluded`:

```ts
// existing insert pattern (search for status='excluded_by_advanced_matching')
//   adapt: use exclude_reason = item.reason for each locationExcluded item.
```

> Before writing this block, read `scan-urls/index.ts` lines around 180–260 to understand the existing exclude pipeline (specifically how `excluded_by_advanced_matching` rows are persisted with `exclude_reason`). Mirror that exact insert shape.

**Step 3: Manual smoke**

Run a scan locally with `pnpm debug:edge` against a Search whose active AI Filter Profile has `location_buckets = ['remote']`. Use a job list URL that contains both remote and on-site jobs. Verify:
- Remote jobs land in New.
- On-site jobs land in Filtered out with `exclude_reason` starting `location_mismatch:`.

**Step 4: Commit**

```bash
git add apps/backend/supabase/functions/_shared/filterJobsByLocation.ts \
        apps/backend/supabase/functions/scan-urls/index.ts
git commit -m "feat(backend): apply AI profile location rules at scan time"
```

---

### Task 8: AI Filter Profile editor — `<LocationPreferences>`

**Files:**
- Modify: `apps/desktopProbe/src/pages/filters.tsx`
- Create: `apps/desktopProbe/src/pages/filters/LocationPreferences.tsx`

**Step 1: Build the component**

```tsx
// LocationPreferences.tsx
import { LOCATION_BUCKETS, LocationBucket } from '@first2apply/core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  buckets: LocationBucket[] | null;
  contains: string[] | null;
  onChange: (patch: { location_buckets?: LocationBucket[] | null; location_contains?: string[] | null }) => void;
};

export function LocationPreferences({ buckets, contains, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const safeBuckets = buckets ?? [];
  const safeContains = contains ?? [];

  const toggleBucket = (b: LocationBucket) => {
    const next = safeBuckets.includes(b)
      ? safeBuckets.filter((x) => x !== b)
      : [...safeBuckets, b];
    onChange({ location_buckets: next.length ? next : null });
  };

  const addChip = () => {
    const v = draft.trim();
    if (!v || safeContains.includes(v)) { setDraft(''); return; }
    onChange({ location_contains: [...safeContains, v] });
    setDraft('');
  };

  const removeChip = (v: string) => {
    const next = safeContains.filter((x) => x !== v);
    onChange({ location_contains: next.length ? next : null });
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Location preferences</h3>
        <p className="text-xs text-muted-foreground">
          Jobs that don't match get moved to Filtered out during scans.
        </p>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium">Work arrangement</div>
        <div className="flex gap-3">
          {LOCATION_BUCKETS.map((b) => (
            <label key={b} className="flex cursor-pointer items-center gap-1 text-xs">
              <Checkbox checked={safeBuckets.includes(b)} onCheckedChange={() => toggleBucket(b)} />
              <span>{b[0].toUpperCase() + b.slice(1)}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Leave all unchecked to allow any work arrangement.
        </p>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium">Location contains (any of)</div>
        <div className="flex flex-wrap items-center gap-1">
          {safeContains.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button type="button" onClick={() => removeChip(v)} aria-label={`Remove ${v}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addChip(); }
            }}
            onBlur={addChip}
            placeholder="Type and press Enter (e.g. United States)"
            className="h-7 w-48 text-xs"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Case-insensitive substring match. Leave empty for no constraint.
        </p>
      </div>
    </section>
  );
}
```

**Step 2: Slot into the profile editor**

In `filters.tsx`, find the existing `<BlacklistedCompanies>` block (line 469-471). Insert the new component above it:

```tsx
<LocationPreferences
  buckets={profile.location_buckets ?? null}
  contains={profile.location_contains ?? null}
  onChange={(patch) => onCommitField(patch)}
/>
```

Extend the `onCommitField` patch type to include `location_buckets` and `location_contains` (line 131 area + line 368 area — both sites). This propagates through `electronMainSdk.tsx` / `supabaseApi.ts` updates of `ai_filter_profiles` — verify the Update path passes the new fields through (it should already since it does `Partial<AiFilterProfile>`).

**Step 3: Typecheck + smoke**

Run: `pnpm typecheck` then `pnpm dev`.
Open AI Filters page, edit a profile:
- Toggle Remote → bucket persists across reload (refresh).
- Add chips "United States" / "Canada" → they persist.
- Empty state (no buckets, no chips) saves as nulls.

**Step 4: Commit**

```bash
git add apps/desktopProbe/src/pages/filters.tsx apps/desktopProbe/src/pages/filters/LocationPreferences.tsx
git commit -m "feat(desktop): location preferences in AI Filter Profile editor"
```

---

### Task 9: Full integration smoke + final commit

**Step 1: Cross-cutting typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

**Step 2: Tests**

Run: `pnpm test`
Expected: PASS. Classifier test from Task 1 is green; nothing else regressed.

**Step 3: Manual end-to-end smoke (desktop app)**

1. Open the app, navigate to Jobs.
2. Open funnel → Location → check Remote. Verify list narrows to remote jobs only.
3. Type "Philippines" in contains → list narrows further.
4. Open Sort dropdown → switch to Oldest first. Verify ascending order (oldest `updated_at` first).
5. Navigate to AI Filters → edit a profile → set Remote-only + contains "United States" → save.
6. Trigger a scan on a Search using that profile against a known mixed URL.
7. After scan completes: New tab has only US-remote jobs; Filtered out tab shows excluded with `location_mismatch:` reasons.

**Step 4: Update CLAUDE.md cheat sheet**

Add a durable line under "Where things live (jump table)":

```
- **Location filtering / sort by date** → `libraries/core/src/classifyLocation.ts` is the canonical
  classifier; SQL mirror in migration `20260528000000_sort_and_location.sql` (function
  `public.classify_job_location`); edge mirror in
  `apps/backend/supabase/functions/_shared/filterJobsByLocation.ts`. Three copies must stay
  in sync — change them together.
```

This is a durable structural fact (a gotcha: three classifier copies) so it belongs in CLAUDE.md per the project rules.

**Step 5: Commit cheat-sheet update**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): note three-way classifyLocation mirrors"
```

---

## Notes for the executing engineer

- **Three classifier copies.** TypeScript (core), SQL (migration), Deno (edge function). They MUST stay in sync. If you change the regex in one, change all three. Task 9 codifies this in CLAUDE.md.
- **Keyset pagination compatibility.** The existing cursor format `id!updated_at` is preserved across both sort directions. Don't introduce a `created_at`-based cursor — it would invalidate stored cursors in URL state.
- **AI Filter Profile lookup in scan-urls.** The plan assumes `activeProfile` is already available in the scan flow. If it isn't, fetch it once per link at the top of the request handler — do NOT re-query per job.
- **Empty arrays vs nulls.** SQL treats `array_length(arr, 1) is null` as "no constraint" — this is true for both `null` and `'{}'`. The UI normalizes empty arrays to `null` on save so the database stays clean.
- **No posted-date sort.** If you're tempted to add it because "it would be easy" — read the design doc's Scope decisions section. Six parsers, ongoing maintenance.
