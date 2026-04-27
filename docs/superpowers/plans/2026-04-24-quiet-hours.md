# Quiet Hours Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-configurable "quiet hours" feature to first2apply that suppresses desktop and Pushover notifications during set windows and delivers a single source-grouped summary at window end.

**Architecture:** Quiet-hours settings persist to Supabase (shared across devices) and are cached locally on every probe instance (offline resilience). A single "Pushover owner" device sends Pushover summaries; every probe handles its own desktop summary. Job scanner gates notifications through a pure `isInQuietHours` predicate. A periodic scheduler tick detects window-end transitions and fires summaries, deduping across instances via a conditional `last_summary_sent_at` update.

**Tech Stack:** Electron + TypeScript (desktopProbe), Supabase (Postgres), Luxon (timezone math), Jest (tests), React + `@first2apply/ui` (settings UI).

**Spec:** `docs/superpowers/specs/2026-04-24-quiet-hours-design.md`

---

## Repo conventions (read first)

- Working dir: `/Users/jacobaguon/projects/first2apply`
- All probe code lives under `apps/desktopProbe/`
- Commit style: short, imperative subject (`feat:`, `fix:`, `test:`, `chore:`). Matches existing log.
- Existing commit hook auto-commits file writes; verify with `git status` and only run `git commit` explicitly when the hook hasn't already captured the change.
- Luxon is already a dep — use it for all timezone math.
- No test files exist under `apps/desktopProbe/` yet. Chunk 2 sets up Jest there.

---

## File structure

**Create:**
- `apps/backend/supabase/migrations/20260424000000_quiet_hours.sql` — schema changes
- `apps/desktopProbe/src/server/quietHours/schedule.ts` — types + schedule helpers (`copyToAll`, `copyToWeekdays`)
- `apps/desktopProbe/src/server/quietHours/predicate.ts` — `isInQuietHours(now, schedule, tz, graceMinutes)` + `windowEndFor(now, ...)` + `mostRecentWindowEnd(now, ...)`
- `apps/desktopProbe/src/server/quietHours/settingsStore.ts` — load/save settings (Supabase + local JSON cache)
- `apps/desktopProbe/src/server/quietHours/summaryScheduler.ts` — periodic tick, owner-only Pushover summary, dedupe via conditional update
- `apps/desktopProbe/src/server/quietHours/desktopSummary.ts` — per-device desktop-summary transition tracker
- `apps/desktopProbe/src/server/quietHours/aggregate.ts` — `aggregateBySource(jobs)` → source-grouped summary payload
- `apps/desktopProbe/src/pages/components/quietHoursSettings.tsx` — UI section
- `apps/desktopProbe/jest.config.ts` — Jest config for the probe
- `apps/desktopProbe/tests/quietHours/*.test.ts` — tests

**Modify:**
- `apps/desktopProbe/src/lib/types.ts` — add `QuietHoursSettings`, extend settings types
- `apps/desktopProbe/src/server/jobScanner.ts:219, 234, 359-397` — gate notifications, pass owner context, skip Pushover on non-owners, stamp `notified_pushover_at` on real sends, wire scheduler tick
- `apps/desktopProbe/src/server/pushover.ts` — no signature change; only called via gated path
- `apps/desktopProbe/src/pages/settings.tsx` — mount new `<QuietHoursSettings />` section
- `apps/desktopProbe/package.json` — add jest + ts-jest scripts if missing (use root versions)

---

## Chunk 1: Database schema

### Task 1.1: `user_settings` table + `jobs.notified_pushover_at`

**Files:**
- Create: `apps/backend/supabase/migrations/20260424000000_quiet_hours.sql`

- [ ] **Step 1: Read existing migration** to match style

Run: `cat apps/backend/supabase/migrations/20260418000000_initial_schema.sql | head -80`

- [ ] **Step 2: Write the migration**

```sql
-- Quiet hours: per-user settings row + per-job pushover notification timestamp
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_timezone text not null default 'UTC',
  quiet_hours_schedule jsonb not null default '{}'::jsonb,
  quiet_hours_grace_minutes integer not null default 0 check (quiet_hours_grace_minutes >= 0),
  pushover_owner_device_id text,
  last_summary_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_self_select" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_self_upsert" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_self_update" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_user_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_user_settings_updated_at();

alter table public.jobs
  add column if not exists notified_pushover_at timestamptz;

create index if not exists jobs_user_notified_pushover_idx
  on public.jobs (user_id, created_at)
  where notified_pushover_at is null;
```

- [ ] **Step 3: Apply locally**

Run: `cd apps/backend && supabase db reset` (or the repo's standard local-apply command — check `apps/backend/README.md` if unclear)
Expected: migration applies without error; `\d public.user_settings` shows the table.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/supabase/migrations/20260424000000_quiet_hours.sql
git commit -m "feat(db): add user_settings and jobs.notified_pushover_at for quiet hours"
```

---

## Chunk 2: Test harness + pure logic (schedule, predicate, aggregate)

### Task 2.1: Jest setup in desktopProbe

**Files:**
- Create: `apps/desktopProbe/jest.config.ts`
- Modify: `apps/desktopProbe/package.json`

- [ ] **Step 1: Inspect root jest config** to match toolchain

Run: `cat package.json | grep -A2 jest; ls jest.config*`

- [ ] **Step 2: Write `jest.config.ts`**

```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
};

export default config;
```

- [ ] **Step 3: Add test script to `apps/desktopProbe/package.json`**

Under `"scripts"`, add: `"test": "jest"`.

- [ ] **Step 4: Verify jest runs (no tests yet = empty pass)**

Run: `cd apps/desktopProbe && pnpm test -- --passWithNoTests`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/jest.config.ts apps/desktopProbe/package.json
git commit -m "chore(probe): add jest config for desktopProbe"
```

### Task 2.2: Types for quiet hours settings

**Files:**
- Modify: `apps/desktopProbe/src/lib/types.ts`

- [ ] **Step 1: Add types**

```ts
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type QuietHoursDay = {
  enabled: boolean;
  /** HH:mm, 00:00–23:59 */
  start: string;
  /** HH:mm; if < start, the window spans into the next day */
  end: string;
};

export type QuietHoursSchedule = Record<DayKey, QuietHoursDay>;

export type QuietHoursSettings = {
  enabled: boolean;
  timezone: string; // IANA
  schedule: QuietHoursSchedule;
  graceMinutes: number;
  pushoverOwnerDeviceId: string | null;
  /** Local-only field; mirrors Supabase `updated_at` for reconciliation */
  updatedAt: string; // ISO
};

export const EMPTY_DAY: QuietHoursDay = { enabled: false, start: '22:00', end: '07:00' };
export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: false,
  timezone: 'UTC',
  schedule: {
    mon: { ...EMPTY_DAY }, tue: { ...EMPTY_DAY }, wed: { ...EMPTY_DAY },
    thu: { ...EMPTY_DAY }, fri: { ...EMPTY_DAY }, sat: { ...EMPTY_DAY }, sun: { ...EMPTY_DAY },
  },
  graceMinutes: 0,
  pushoverOwnerDeviceId: null,
  updatedAt: new Date(0).toISOString(),
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktopProbe/src/lib/types.ts
git commit -m "feat(probe): add QuietHoursSettings types"
```

### Task 2.3: Schedule helpers (`copyToAll`, `copyToWeekdays`)

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/schedule.ts`
- Test: `apps/desktopProbe/tests/quietHours/schedule.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { copyToAll, copyToWeekdays } from '../../src/server/quietHours/schedule';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const src = { enabled: true, start: '22:00', end: '07:00' };

test('copyToAll overwrites every day', () => {
  const out = copyToAll(DEFAULT_QUIET_HOURS.schedule, src);
  for (const k of ['mon','tue','wed','thu','fri','sat','sun'] as const) {
    expect(out[k]).toEqual(src);
  }
});

test('copyToWeekdays overwrites mon-fri and leaves sat/sun', () => {
  const out = copyToWeekdays(DEFAULT_QUIET_HOURS.schedule, src);
  for (const k of ['mon','tue','wed','thu','fri'] as const) expect(out[k]).toEqual(src);
  expect(out.sat).toEqual(DEFAULT_QUIET_HOURS.schedule.sat);
  expect(out.sun).toEqual(DEFAULT_QUIET_HOURS.schedule.sun);
});

test('copyToAll does not mutate input', () => {
  const original = JSON.parse(JSON.stringify(DEFAULT_QUIET_HOURS.schedule));
  copyToAll(DEFAULT_QUIET_HOURS.schedule, src);
  expect(DEFAULT_QUIET_HOURS.schedule).toEqual(original);
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `cd apps/desktopProbe && pnpm test -- schedule.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { DayKey, QuietHoursDay, QuietHoursSchedule } from '../../lib/types';

const ALL: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun'];
const WEEKDAYS: DayKey[] = ['mon','tue','wed','thu','fri'];

export function copyToAll(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of ALL) next[k] = { ...day };
  return next;
}

export function copyToWeekdays(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of WEEKDAYS) next[k] = { ...day };
  return next;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cd apps/desktopProbe && pnpm test -- schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/src/server/quietHours/schedule.ts apps/desktopProbe/tests/quietHours/schedule.test.ts
git commit -m "feat(probe): quiet hours schedule helpers"
```

### Task 2.4: `isInQuietHours` + window-boundary math

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/predicate.ts`
- Test: `apps/desktopProbe/tests/quietHours/predicate.test.ts`

- [ ] **Step 1: Write failing tests** (cover: same-day window, midnight-spanning window from previous day, grace period, disabled day, DST spring-forward, windowEndFor, mostRecentWindowEnd)

```ts
import { DateTime } from 'luxon';
import { isInQuietHours, windowEndFor, mostRecentWindowEnd } from '../../src/server/quietHours/predicate';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const tz = 'America/Los_Angeles';
const schedWith = (overrides: Partial<Record<keyof typeof DEFAULT_QUIET_HOURS.schedule, any>>) => ({
  ...DEFAULT_QUIET_HOURS.schedule,
  ...overrides,
});

test('same-day window: inside', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate(); // Wed
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('same-day window: outside', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T18:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(false);
});

test('midnight-spanning: rolls from Mon 22:00 into Tue 07:00', () => {
  const sched = schedWith({ mon: { enabled: true, start: '22:00', end: '07:00' } });
  // Tue 03:00 local is still inside Mon's window
  const now = DateTime.fromISO('2026-04-21T03:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('grace period collapses inside→outside near end', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T16:55', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 10)).toBe(false); // within 10min of 17:00
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('disabled day is never inside', () => {
  const sched = schedWith({ wed: { enabled: false, start: '00:00', end: '23:59' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(false);
});

test('DST spring-forward respects local wall clock', () => {
  // 2026 US spring-forward: Mar 8, 02:00 → 03:00. A 01:30–04:00 window on Sat->Sun test:
  const sched = schedWith({ sat: { enabled: true, start: '23:00', end: '04:00' } });
  const now = DateTime.fromISO('2026-03-08T03:30', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('windowEndFor returns current window end in local tz', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate();
  const end = windowEndFor(now, sched, tz)!;
  expect(DateTime.fromJSDate(end).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm")).toBe('2026-04-22T17:00');
});

test('mostRecentWindowEnd returns the last ended window before now', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T20:00', { zone: tz }).toJSDate();
  const end = mostRecentWindowEnd(now, sched, tz)!;
  expect(DateTime.fromJSDate(end).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm")).toBe('2026-04-22T17:00');
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `cd apps/desktopProbe && pnpm test -- predicate.test.ts`

- [ ] **Step 3: Implement**

```ts
import { DateTime } from 'luxon';
import { DayKey, QuietHoursSchedule } from '../../lib/types';

const DAY_KEYS: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun'];
const dayKeyOf = (dt: DateTime): DayKey => DAY_KEYS[(dt.weekday - 1) as 0|1|2|3|4|5|6];

type Interval = { start: DateTime; end: DateTime };

/** All windows that could be "current" at `now`: today's (if it has started) + yesterday's (if it spans midnight). */
function candidateWindows(now: DateTime, sched: QuietHoursSchedule): Interval[] {
  const out: Interval[] = [];
  for (const offset of [-1, 0]) {
    const base = now.plus({ days: offset }).startOf('day');
    const cfg = sched[dayKeyOf(base)];
    if (!cfg?.enabled) continue;
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const start = base.set({ hour: sh, minute: sm });
    let end = base.set({ hour: eh, minute: em });
    if (end <= start) end = end.plus({ days: 1 });
    out.push({ start, end });
  }
  return out;
}

export function isInQuietHours(now: Date, sched: QuietHoursSchedule, tz: string, graceMinutes: number): boolean {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  for (const w of candidateWindows(dt, sched)) {
    if (dt < w.start || dt >= w.end) continue;
    if (graceMinutes > 0 && w.end.diff(dt, 'minutes').minutes <= graceMinutes) return false;
    return true;
  }
  return false;
}

export function windowEndFor(now: Date, sched: QuietHoursSchedule, tz: string): Date | null {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  for (const w of candidateWindows(dt, sched)) {
    if (dt >= w.start && dt < w.end) return w.end.toJSDate();
  }
  return null;
}

export function mostRecentWindowEnd(now: Date, sched: QuietHoursSchedule, tz: string): Date | null {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  // Check up to 8 days back to cover any schedule.
  let latest: DateTime | null = null;
  for (let offset = -8; offset <= 0; offset++) {
    const base = dt.plus({ days: offset }).startOf('day');
    const cfg = sched[dayKeyOf(base)];
    if (!cfg?.enabled) continue;
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const start = base.set({ hour: sh, minute: sm });
    let end = base.set({ hour: eh, minute: em });
    if (end <= start) end = end.plus({ days: 1 });
    if (end <= dt && (!latest || end > latest)) latest = end;
  }
  return latest ? latest.toJSDate() : null;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd apps/desktopProbe && pnpm test -- predicate.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/src/server/quietHours/predicate.ts apps/desktopProbe/tests/quietHours/predicate.test.ts
git commit -m "feat(probe): quiet hours predicate with tz, DST, grace support"
```

### Task 2.5: Source-grouped aggregation

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/aggregate.ts`
- Test: `apps/desktopProbe/tests/quietHours/aggregate.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { aggregateBySource, formatSummaryBody } from '../../src/server/quietHours/aggregate';

test('aggregates and sorts by count desc', () => {
  const jobs = [
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'Indeed', searchTitle: 'Product Designer' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
  ];
  expect(aggregateBySource(jobs)).toEqual([
    { site: 'LinkedIn', search: 'Frontend Remote', count: 3 },
    { site: 'Indeed', search: 'Product Designer', count: 1 },
  ]);
});

test('formatSummaryBody produces expected lines', () => {
  const body = formatSummaryBody([
    { site: 'LinkedIn', search: 'Frontend Remote', count: 5 },
    { site: 'Indeed', search: 'Product Designer', count: 2 },
  ]);
  expect(body).toBe('5 from LinkedIn – "Frontend Remote"\n2 from Indeed – "Product Designer"');
});
```

- [ ] **Step 2: Run, confirm fail.** `cd apps/desktopProbe && pnpm test -- aggregate.test.ts`

- [ ] **Step 3: Implement**

```ts
export type SourceGroup = { site: string; search: string; count: number };

export function aggregateBySource(jobs: Array<{ siteName: string; searchTitle: string }>): SourceGroup[] {
  const m = new Map<string, SourceGroup>();
  for (const j of jobs) {
    const k = `${j.siteName}::${j.searchTitle}`;
    const existing = m.get(k);
    if (existing) existing.count += 1;
    else m.set(k, { site: j.siteName, search: j.searchTitle, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function formatSummaryBody(groups: SourceGroup[]): string {
  return groups.map(g => `${g.count} from ${g.site} – "${g.search}"`).join('\n');
}

export function formatSummaryTitle(total: number): string {
  return `${total} new job${total === 1 ? '' : 's'} while you were away`;
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/src/server/quietHours/aggregate.ts apps/desktopProbe/tests/quietHours/aggregate.test.ts
git commit -m "feat(probe): quiet hours summary aggregation + formatting"
```

---

## Chunk 3: Settings store (Supabase + local cache)

### Task 3.1: `settingsStore.ts`

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/settingsStore.ts`
- Test: `apps/desktopProbe/tests/quietHours/settingsStore.test.ts`

**Behavior spec:**
- `load()`: read local JSON file first; in the background, fetch Supabase; if remote `updated_at` > local, overwrite local and return remote. If Supabase fails, return local as-is. If local missing, return `DEFAULT_QUIET_HOURS`.
- `save(patch)`: merge into current, write Supabase first, then local on success. Throw on Supabase failure (UI handles).
- File path: `path.join(app.getPath('userData'), 'quiet-hours-settings.json')` — inject via constructor so tests can use tmp dir.

- [ ] **Step 1: Read existing settings load/save** to match patterns

Run: `grep -n 'getPath\|settings.json\|_saveSettings' apps/desktopProbe/src/server/jobScanner.ts | head -20`

- [ ] **Step 2: Write failing tests** using a tmp dir + mock Supabase client

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { QuietHoursSettingsStore } from '../../src/server/quietHours/settingsStore';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qh-')), 'settings.json');
}

const okSb = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
    upsert: async (_row: any) => ({ data: null, error: null }),
  }),
};

test('load returns defaults when nothing exists', async () => {
  const s = new QuietHoursSettingsStore({ filePath: tmpFile(), userId: 'u', supabase: okSb as any });
  expect(await s.load()).toEqual(DEFAULT_QUIET_HOURS);
});

test('load returns local when Supabase fails', async () => {
  const file = tmpFile();
  const local = { ...DEFAULT_QUIET_HOURS, enabled: true, updatedAt: '2026-04-20T00:00:00.000Z' };
  fs.writeFileSync(file, JSON.stringify(local));
  const failingSb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('net') }) }) }),
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: failingSb as any });
  const got = await s.load();
  expect(got.enabled).toBe(true);
});

test('save writes supabase first then local', async () => {
  const file = tmpFile();
  let upserted: any = null;
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async (row: any) => { upserted = row; return { data: null, error: null }; },
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: sb as any });
  await s.save({ enabled: true });
  expect(upserted.quiet_hours_enabled).toBe(true);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).enabled).toBe(true);
});

test('save throws and does not update local on supabase failure', async () => {
  const file = tmpFile();
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ data: null, error: new Error('denied') }),
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: sb as any });
  await expect(s.save({ enabled: true })).rejects.toThrow('denied');
  expect(fs.existsSync(file)).toBe(false);
});
```

- [ ] **Step 3: Run, confirm fail.**

- [ ] **Step 4: Implement**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_QUIET_HOURS, QuietHoursSettings } from '../../lib/types';

type Opts = { filePath: string; userId: string; supabase: SupabaseClient };

export class QuietHoursSettingsStore {
  constructor(private opts: Opts) {}

  private readLocal(): QuietHoursSettings | null {
    try {
      const raw = fs.readFileSync(this.opts.filePath, 'utf8');
      return { ...DEFAULT_QUIET_HOURS, ...JSON.parse(raw) };
    } catch { return null; }
  }

  private writeLocal(s: QuietHoursSettings) {
    fs.mkdirSync(path.dirname(this.opts.filePath), { recursive: true });
    fs.writeFileSync(this.opts.filePath, JSON.stringify(s, null, 2));
  }

  async load(): Promise<QuietHoursSettings> {
    const local = this.readLocal() ?? DEFAULT_QUIET_HOURS;
    try {
      const { data, error } = await this.opts.supabase
        .from('user_settings').select('*').eq('user_id', this.opts.userId).maybeSingle();
      if (error || !data) return local;
      const remote = this.fromRow(data);
      if (new Date(remote.updatedAt) > new Date(local.updatedAt)) {
        this.writeLocal(remote);
        return remote;
      }
      return local;
    } catch {
      return local;
    }
  }

  async save(patch: Partial<QuietHoursSettings>): Promise<QuietHoursSettings> {
    const current = this.readLocal() ?? DEFAULT_QUIET_HOURS;
    const next: QuietHoursSettings = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const { error } = await this.opts.supabase
      .from('user_settings').upsert(this.toRow(next), { onConflict: 'user_id' });
    if (error) throw error;
    this.writeLocal(next);
    return next;
  }

  private toRow(s: QuietHoursSettings) {
    return {
      user_id: this.opts.userId,
      quiet_hours_enabled: s.enabled,
      quiet_hours_timezone: s.timezone,
      quiet_hours_schedule: s.schedule,
      quiet_hours_grace_minutes: s.graceMinutes,
      pushover_owner_device_id: s.pushoverOwnerDeviceId,
    };
  }

  private fromRow(r: any): QuietHoursSettings {
    return {
      enabled: !!r.quiet_hours_enabled,
      timezone: r.quiet_hours_timezone ?? 'UTC',
      schedule: r.quiet_hours_schedule ?? DEFAULT_QUIET_HOURS.schedule,
      graceMinutes: r.quiet_hours_grace_minutes ?? 0,
      pushoverOwnerDeviceId: r.pushover_owner_device_id ?? null,
      updatedAt: r.updated_at ?? new Date(0).toISOString(),
    };
  }
}
```

- [ ] **Step 5: Run, confirm pass.**

- [ ] **Step 6: Commit**

```bash
git add apps/desktopProbe/src/server/quietHours/settingsStore.ts apps/desktopProbe/tests/quietHours/settingsStore.test.ts
git commit -m "feat(probe): quiet hours settings store with supabase + local cache"
```

---

## Chunk 4: Summary scheduler (Pushover + desktop)

### Task 4.1: Desktop transition tracker

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/desktopSummary.ts`
- Test: `apps/desktopProbe/tests/quietHours/desktopSummary.test.ts`

Responsibilities:
- Keep in-memory `wasInside` state.
- On transition `inside → outside`, call injected `notify(total, groups)` with jobs created during the window observed (queried via injected `loadJobsBetween(start, end)`).

- [ ] **Step 1: Write failing test** (simulate two ticks: first inside, second outside; assert notify called once with aggregated body)

```ts
import { DesktopSummaryTracker } from '../../src/server/quietHours/desktopSummary';

test('fires summary on inside→outside transition', async () => {
  const notify = jest.fn();
  const loadJobs = jest.fn().mockResolvedValue([
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
  ]);
  const t = new DesktopSummaryTracker({ notify, loadJobsBetween: loadJobs });

  await t.tick({ isInside: true, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T10:00Z') });
  expect(notify).not.toHaveBeenCalled();

  await t.tick({ isInside: false, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T17:01Z') });
  expect(notify).toHaveBeenCalledTimes(1);
  const [total, groups] = notify.mock.calls[0];
  expect(total).toBe(2);
  expect(groups[0]).toMatchObject({ site: 'LinkedIn', count: 2 });
});

test('does not fire when no new jobs', async () => {
  const notify = jest.fn();
  const loadJobs = jest.fn().mockResolvedValue([]);
  const t = new DesktopSummaryTracker({ notify, loadJobsBetween: loadJobs });
  await t.tick({ isInside: true, windowStart: new Date(), now: new Date() });
  await t.tick({ isInside: false, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T17:01Z') });
  expect(notify).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```ts
import { aggregateBySource, SourceGroup } from './aggregate';

type JobRow = { siteName: string; searchTitle: string };
type Deps = {
  notify: (total: number, groups: SourceGroup[]) => void | Promise<void>;
  loadJobsBetween: (start: Date, end: Date) => Promise<JobRow[]>;
};

export class DesktopSummaryTracker {
  private wasInside = false;
  private lastWindowStart: Date | null = null;
  constructor(private deps: Deps) {}

  async tick(state: { isInside: boolean; windowStart: Date | null; now: Date }): Promise<void> {
    if (this.wasInside && !state.isInside && this.lastWindowStart) {
      const jobs = await this.deps.loadJobsBetween(this.lastWindowStart, state.now);
      if (jobs.length > 0) {
        await this.deps.notify(jobs.length, aggregateBySource(jobs));
      }
    }
    this.wasInside = state.isInside;
    if (state.isInside) this.lastWindowStart = state.windowStart;
  }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/src/server/quietHours/desktopSummary.ts apps/desktopProbe/tests/quietHours/desktopSummary.test.ts
git commit -m "feat(probe): desktop summary transition tracker"
```

### Task 4.2: Pushover summary scheduler (owner-only + dedupe)

**Files:**
- Create: `apps/desktopProbe/src/server/quietHours/summaryScheduler.ts`
- Test: `apps/desktopProbe/tests/quietHours/summaryScheduler.test.ts`

Responsibilities:
- `tickOwner({ now, settings })`: if device is not owner, return. Compute `mostRecentWindowEnd`; if it exists and `> last_summary_sent_at`, attempt conditional update (`update user_settings set last_summary_sent_at = windowEnd where user_id = ? and (last_summary_sent_at is null or last_summary_sent_at < windowEnd)`). If affected rows = 1, query unnotified jobs in `[windowStart, windowEnd]`, send Pushover, then stamp `notified_pushover_at = now()`.

- [ ] **Step 1: Write failing test** (mock supabase: conditional update returns count=1 the first call, 0 on subsequent; assert Pushover sent once across two tick calls)

```ts
import { PushoverSummaryScheduler } from '../../src/server/quietHours/summaryScheduler';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const settings = {
  ...DEFAULT_QUIET_HOURS,
  enabled: true,
  timezone: 'UTC',
  schedule: { ...DEFAULT_QUIET_HOURS.schedule, wed: { enabled: true, start: '09:00', end: '17:00' } },
  pushoverOwnerDeviceId: 'dev-A',
};

function makeSb(claimReturns: number[]) {
  const calls = { claim: 0, stamp: 0, loadJobs: 0 };
  let claimIdx = 0;
  const sb: any = {
    rpc: async (name: string) => {
      if (name === 'claim_summary_send') { calls.claim++; return { data: claimReturns[claimIdx++], error: null }; }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            gte: () => ({
              lt: async () => ({
                data: [{ siteName: 'LinkedIn', searchTitle: 'Frontend' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
      update: () => ({ eq: () => ({ is: async () => ({ data: null, error: null, count: 1 }) }) }),
    }),
    _calls: calls,
  };
  return sb;
}

test('owner sends summary once, dedupes subsequent ticks', async () => {
  const sb = makeSb([1, 0]);
  const sendPushover = jest.fn().mockResolvedValue(undefined);
  const scheduler = new PushoverSummaryScheduler({ supabase: sb, userId: 'u', deviceId: 'dev-A', sendPushover });
  const now = new Date('2026-04-22T18:00:00Z');
  await scheduler.tick({ now, settings });
  await scheduler.tick({ now, settings });
  expect(sendPushover).toHaveBeenCalledTimes(1);
});

test('non-owner device never sends', async () => {
  const sb = makeSb([1]);
  const sendPushover = jest.fn();
  const scheduler = new PushoverSummaryScheduler({ supabase: sb, userId: 'u', deviceId: 'dev-B', sendPushover });
  await scheduler.tick({ now: new Date('2026-04-22T18:00:00Z'), settings });
  expect(sendPushover).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Add supporting RPC to the migration** (chunk 1 addendum — apply as a new migration file if chunk 1 is already committed):

File: `apps/backend/supabase/migrations/20260424000001_claim_summary_send.sql`

```sql
create or replace function public.claim_summary_send(p_user_id uuid, p_window_end timestamptz)
returns integer language plpgsql security definer as $$
declare
  updated integer;
begin
  update public.user_settings
     set last_summary_sent_at = p_window_end
   where user_id = p_user_id
     and (last_summary_sent_at is null or last_summary_sent_at < p_window_end);
  get diagnostics updated = row_count;
  return updated;
end $$;

grant execute on function public.claim_summary_send(uuid, timestamptz) to authenticated;
```

Apply locally and commit.

- [ ] **Step 4: Implement scheduler**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { QuietHoursSettings } from '../../lib/types';
import { mostRecentWindowEnd, windowEndFor } from './predicate';
import { aggregateBySource, formatSummaryBody, formatSummaryTitle } from './aggregate';

type Deps = {
  supabase: SupabaseClient;
  userId: string;
  deviceId: string;
  sendPushover: (title: string, body: string) => Promise<void>;
};

export class PushoverSummaryScheduler {
  constructor(private deps: Deps) {}

  async tick({ now, settings }: { now: Date; settings: QuietHoursSettings }): Promise<void> {
    if (!settings.enabled) return;
    if (settings.pushoverOwnerDeviceId !== this.deps.deviceId) return;

    const endCurrent = windowEndFor(now, settings.schedule, settings.timezone);
    const windowEnd = endCurrent ?? mostRecentWindowEnd(now, settings.schedule, settings.timezone);
    if (!windowEnd || windowEnd > now) return;

    const windowStart = this.inferWindowStart(windowEnd, settings);

    const { data: claimed, error: claimErr } = await this.deps.supabase
      .rpc('claim_summary_send', { p_user_id: this.deps.userId, p_window_end: windowEnd.toISOString() });
    if (claimErr || !claimed) return;

    const { data: jobs } = await this.deps.supabase
      .from('jobs')
      .select('siteName, searchTitle, id')
      .eq('user_id', this.deps.userId)
      .is('notified_pushover_at', null)
      .gte('created_at', windowStart.toISOString())
      .lt('created_at', windowEnd.toISOString());
    const rows = (jobs as any[] | null) ?? [];
    if (rows.length === 0) return;

    const groups = aggregateBySource(rows);
    await this.deps.sendPushover(formatSummaryTitle(rows.length), formatSummaryBody(groups));

    await this.deps.supabase
      .from('jobs')
      .update({ notified_pushover_at: new Date().toISOString() })
      .eq('user_id', this.deps.userId)
      .is('notified_pushover_at', null)
      .in('id', rows.map(r => r.id));
  }

  private inferWindowStart(end: Date, s: QuietHoursSettings): Date {
    // Walk back up to 48h; find the schedule entry whose computed end equals `end`.
    const endDt = DateTime.fromJSDate(end).setZone(s.timezone);
    for (let offset = 0; offset < 8; offset++) {
      const base = endDt.minus({ days: offset }).startOf('day');
      const key = ['mon','tue','wed','thu','fri','sat','sun'][(base.weekday - 1)] as keyof typeof s.schedule;
      const cfg = s.schedule[key];
      if (!cfg?.enabled) continue;
      const [sh, sm] = cfg.start.split(':').map(Number);
      const [eh, em] = cfg.end.split(':').map(Number);
      const start = base.set({ hour: sh, minute: sm });
      let computedEnd = base.set({ hour: eh, minute: em });
      if (computedEnd <= start) computedEnd = computedEnd.plus({ days: 1 });
      if (Math.abs(computedEnd.toMillis() - end.getTime()) < 1000) return start.toJSDate();
    }
    return new Date(end.getTime() - 24 * 3600 * 1000);
  }
}
```

- [ ] **Step 5: Run, confirm pass.**

- [ ] **Step 6: Commit**

```bash
git add apps/backend/supabase/migrations/20260424000001_claim_summary_send.sql \
        apps/desktopProbe/src/server/quietHours/summaryScheduler.ts \
        apps/desktopProbe/tests/quietHours/summaryScheduler.test.ts
git commit -m "feat(probe): pushover summary scheduler with owner-only dedupe"
```

---

## Chunk 5: Wire into `jobScanner.ts`

### Task 5.1: Gate notifications + run scheduler tick

**Files:**
- Modify: `apps/desktopProbe/src/server/jobScanner.ts` (around lines 90–98 init, 219 new-jobs filter, 234 `showNewJobsNotification` call, 359–397 notification dispatch)

- [ ] **Step 1: Re-read scanner context**

Run: `sed -n '80,260p;350,410p' apps/desktopProbe/src/server/jobScanner.ts`

- [ ] **Step 2: Inject dependencies at init** (around line 90–98):

```ts
// near constructor/init
this.quietHoursStore = new QuietHoursSettingsStore({
  filePath: path.join(app.getPath('userData'), 'quiet-hours-settings.json'),
  userId: this.userId,
  supabase: this.supabase,
});
this.summaryScheduler = new PushoverSummaryScheduler({
  supabase: this.supabase,
  userId: this.userId,
  deviceId: this.deviceId, // reuse the amplitude deviceId hash (import from amplitude.ts)
  sendPushover: (title, body) => sendPushover({
    appToken: this.pushoverAppToken,
    userKey: this.pushoverUserKey,
    title, message: body,
  }),
});
this.desktopSummary = new DesktopSummaryTracker({
  notify: (total, groups) => this.showSummaryDesktopNotification(total, groups),
  loadJobsBetween: (start, end) => this.loadJobsBetween(start, end),
});
```

- [ ] **Step 3: Gate dispatch in `showNewJobsNotification`** (replace dispatch block around lines 359–397):

```ts
private async showNewJobsNotification({ newJobs }: { newJobs: Job[] }) {
  const settings = await this.quietHoursStore.load();
  const inside = settings.enabled && isInQuietHours(new Date(), settings.schedule, settings.timezone, settings.graceMinutes);
  const isOwner = settings.pushoverOwnerDeviceId === this.deviceId;

  if (!inside) {
    // existing desktop Notification code stays here
    try { new Notification({ /* ... */ }).show(); } catch { /* headless */ }
  }

  if (!inside && isOwner && this.pushoverEnabled) {
    await sendPushover({ appToken: this.pushoverAppToken, userKey: this.pushoverUserKey,
      title: `${newJobs.length} new job${newJobs.length === 1 ? '' : 's'}`, message: this.formatPushoverBody(newJobs) });
    // stamp notified_pushover_at for sent jobs
    await this.supabase.from('jobs').update({ notified_pushover_at: new Date().toISOString() })
      .in('id', newJobs.map(j => j.id));
  }
}
```

- [ ] **Step 4: Add scheduler + desktop-summary tick** on the existing scan interval. In `scanLinks()` or the top-level interval handler, after scan completes:

```ts
const settings = await this.quietHoursStore.load();
const inside = settings.enabled && isInQuietHours(new Date(), settings.schedule, settings.timezone, settings.graceMinutes);
const windowStart = inside ? this.computeWindowStart(new Date(), settings) : null;
await this.desktopSummary.tick({ isInside: inside, windowStart, now: new Date() });
await this.summaryScheduler.tick({ now: new Date(), settings });
```

- [ ] **Step 5: Add `showSummaryDesktopNotification` + `loadJobsBetween` + `computeWindowStart` helpers** on the scanner class, using `aggregate.ts`.

- [ ] **Step 6: Manual smoke test**

Run: `cd apps/desktopProbe && pnpm dev` (or repo-standard command)
- Set quiet hours in settings UI (task 6.1 arrives after this — use a direct DB row for this smoke test).
- Trigger a scan during the window; confirm no desktop notification, no Pushover.
- Wait for window end (or temporarily shorten window); confirm one summary desktop notification fires and (if owner + enabled) one Pushover.

- [ ] **Step 7: Commit**

```bash
git add apps/desktopProbe/src/server/jobScanner.ts
git commit -m "feat(probe): gate scan notifications through quiet hours + run summary tick"
```

---

## Chunk 6: Settings UI

### Task 6.1: `QuietHoursSettings` component

**Files:**
- Create: `apps/desktopProbe/src/pages/components/quietHoursSettings.tsx`
- Modify: `apps/desktopProbe/src/pages/settings.tsx`

- [ ] **Step 1: Read existing section pattern**

Run: `sed -n '140,235p' apps/desktopProbe/src/pages/settings.tsx`

- [ ] **Step 2: Implement component** (match existing `space-y-4 rounded-lg border p-6` container style, use `@first2apply/ui` Switch/Select/Input/Label)

Key controls:
- Master `Switch` bound to `settings.enabled`.
- `Select` for timezone: options from `Intl.supportedValuesOf('timeZone')`; default from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Per-day rows rendered from `['mon',…,'sun']`: each has `Switch`, `Input type="time"` for start, `Input type="time"` for end.
- `Button` "Copy to all days" → calls `copyToAll(schedule, firstEnabledOrTemplateDay)`.
- `Button` "Copy to weekdays" → calls `copyToWeekdays(...)`.
- `Input type="number"` for `graceMinutes` (min 0).
- `Switch` "This device sends Pushover notifications" — when toggled on, sets `pushoverOwnerDeviceId = this.deviceId` (passed in via props from the page); when off, sets to `null`.
- Save button calls `store.save(nextSettings)`; surface errors in a toast.

- [ ] **Step 3: Mount in `settings.tsx`**

Add `<QuietHoursSettings deviceId={deviceId} store={quietHoursStore} />` under the existing Pushover section.

- [ ] **Step 4: Manual test** in the running app: toggle enable, pick a tz, set a window, hit save, reload app, confirm persistence; check Supabase `user_settings` row matches.

- [ ] **Step 5: Commit**

```bash
git add apps/desktopProbe/src/pages/components/quietHoursSettings.tsx apps/desktopProbe/src/pages/settings.tsx
git commit -m "feat(probe): settings UI section for quiet hours"
```

---

## Chunk 7: Final verification

### Task 7.1: End-to-end smoke

- [ ] Run all tests: `cd apps/desktopProbe && pnpm test`. Expect all green.
- [ ] Configure a 5-minute quiet-hours window on the Pi, mark Pi as Pushover owner from laptop settings UI, restart Pi probe, verify:
  - During window: no Pushover, no desktop notification.
  - At end: one Pushover summary from Pi, one desktop summary on each running client.
  - Unplug Pi network mid-window: Pi keeps honoring settings; summaries queued and flush on reconnect.
- [ ] Double-owner test: set laptop as owner; confirm Pi stops sending Pushover.

### Task 7.2: Update CHANGELOG

- [ ] Add an entry: "Quiet hours: configurable daily windows suppress desktop and Pushover notifications; end-of-window summary grouped by source search/site."

- [ ] Commit: `git commit -m "docs: changelog entry for quiet hours"`

---

## Notes for the implementer

- If a step's code doesn't compile against current types in `jobScanner.ts` (e.g. `Job` type missing `siteName`/`searchTitle`), add the needed fields by reading how existing notification code derives them — don't invent.
- The `computeWindowStart` helper on the scanner mirrors `inferWindowStart` in `summaryScheduler.ts`. Extract to `predicate.ts` as `windowStartFor(end, schedule, tz)` if duplication bites — YAGNI until then.
- Don't forget RLS: every Supabase read/write in the probe runs as the logged-in user; the policies in chunk 1 ensure `auth.uid() = user_id`.
- Pushover rate limits: 10k/month per app token. End-of-window summaries are at most 1/window/owner — well under.
