# Referral and Contacts Surfacing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist LinkedIn connections, show "you know N people at this company" on jobs, draft referral messages with AI (copy and open-profile only), log outreach, and nudge via Pushover when a follow-up is due.

**Architecture:** Company matching lives in the database through a normalized `company_key` (generated columns on `jobs` and `connections`), with a TypeScript twin for tests and UI counts. Desktop talks to Supabase through Electron IPC handlers (`rendererIpcApi.ts`) and renderer wrappers (`electronMainSdk.tsx`). Drafting is a new edge function `draft-referral` built like `tailor-cv`. The Pi probe gets a daily nudge job.

**Tech Stack:** Postgres/Supabase (migrations, RLS, plpgsql), Deno edge functions, TypeScript (jest in `libraries/core`, Deno tests in `apps/backend`, vitest in `apps/desktopProbe`), React/Electron, node-cron, Pushover, Playwright (`qa/`).

**Design:** `docs/plans/2026-10-08-referral-contacts-design.md`. Read it first.

**Rules for the whole plan:** no em-dashes anywhere (code, comments, commits). Commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `feat/referral-contacts` in a worktree (`git worktree add ../first2apply-wt-referrals -b feat/referral-contacts master`, then `pnpm install --frozen-lockfile` and build libs: `pnpm --filter @first2apply/core build && pnpm --filter @first2apply/scraper build && pnpm --filter @first2apply/ui build`). Applying the migration to the cloud project and deploying to the Pi are one-way doors: stop and get the user's confirmation at Task 4, Task 10 and Task 13.

**Known facts that shape this plan (verified in the repo on 2026-10-08):**
- `libraries/core` tests use jest and are run manually: `cd libraries/core && npx jest --config ./jest.config.ts <file>`. The `test#` script is disabled.
- There is no SQL/TS parity test for `classify_job_location` today. This plan adds one for `company_key` (Task 2).
- `libraries/core/src/index.deno.ts` exports only `error`, `types` and `classifyLocation` with `.ts` extensions. Anything the edge functions import from core needs a line there.
- `apps/desktopProbe/vitest.config.ts` only picks up `src/server/__tests__/**`, and excludes `src/server/connections/**`. Do not put new vitest tests in `connections/`.
- Edge functions return HTTP 200 with `{ error: { code, message } }` on failure. Follow that.
- `qa/seed-qa-account.sh` fixtures are idempotent through count checks. Keep it that way.
- `openAI.ts` parses env at import time in tests only through `parseEnv`; do not import `openAI.ts` from code under Deno test. Use structural types instead (Task 9).

---

## Task 1: Migration (tables, company_key, functions, RLS)

**Files:**
- Create: `apps/backend/supabase/migrations/20261008000000_referral_contacts.sql`

**Step 1: Write the migration**

```sql
-- 20261008000000_referral_contacts.sql
--
-- Referral and contacts surfacing. See docs/plans/2026-10-08-referral-contacts-design.md
-- The company_key rules MUST stay identical to libraries/core/src/companyKey.ts.
-- Shared fixtures: libraries/core/src/__fixtures__/companyKey.fixtures.json,
-- checked against this function by apps/backend/scripts/company-key-parity.mjs.

-- 1. company_key: lowercase, drop co-op words, & -> and, punctuation -> space,
--    drop a leading "the", then drop trailing legal suffixes (never the last token).
--    Non a-z0-9 characters (accents, non-latin) become spaces, same as the TS twin.
create or replace function public.company_key(name text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  tokens text[];
  suffixes text[] := array[
    'inc', 'incorporated', 'llc', 'ltd', 'limited', 'co', 'corp', 'corporation',
    'company', 'gmbh', 'plc', 'lp', 'llp', 'sa', 'ag', 'bv', 'pty', 'pllc'
  ];
begin
  if name is null then
    return '';
  end if;
  s := lower(name);
  s := regexp_replace(s, '\mco-?op\M', ' ', 'g');
  s := regexp_replace(s, '\mcooperative\M', ' ', 'g');
  s := replace(s, '&', ' and ');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  tokens := array_remove(regexp_split_to_array(btrim(s), '\s+'), '');
  if array_length(tokens, 1) > 1 and tokens[1] = 'the' then
    tokens := tokens[2:array_length(tokens, 1)];
  end if;
  while array_length(tokens, 1) > 1 and tokens[array_length(tokens, 1)] = any (suffixes) loop
    tokens := tokens[1:array_length(tokens, 1) - 1];
  end loop;
  return coalesce(array_to_string(tokens, ' '), '');
end;
$$;

-- 2. Aliases for names normalization cannot merge (empty at first).
create table if not exists public.company_aliases (
  alias_key text primary key,
  canonical_key text not null
);

alter table public.company_aliases enable row level security;

drop policy if exists "company_aliases read" on public.company_aliases;
create policy "company_aliases read"
on public.company_aliases
for select
to authenticated
using (true);

create or replace function public.canonical_company_key(k text)
returns text
language sql
stable
as $$
  select coalesce((select a.canonical_key from public.company_aliases a where a.alias_key = k), k)
$$;

-- 3. jobs.company_key (generated, so the scanner needs no change).
alter table public.jobs
  add column if not exists company_key text
  generated always as (public.company_key("companyName")) stored;

create index if not exists jobs_user_company_key_idx on public.jobs (user_id, company_key);

-- 4. connections (LinkedIn export rows; no email column on purpose).
create table if not exists public.connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  linkedin_url text not null,
  company text not null default '',
  company_key text generated always as (public.company_key(company)) stored,
  position_title text not null default '',
  connected_on date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, linkedin_url)
);

create index if not exists connections_user_company_key_idx on public.connections (user_id, company_key);

alter table public.connections enable row level security;

drop policy if exists "connections owner all" on public.connections;
create policy "connections owner all"
on public.connections
as permissive
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 5. referral_outreach: one row per contact per job.
create table if not exists public.referral_outreach (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  connection_id bigint not null references public.connections(id) on delete cascade,
  status text not null default 'drafted'
    check (status in ('drafted', 'asked', 'replied', 'referred', 'no_reply', 'declined')),
  draft text null,
  asked_at timestamptz null,
  follow_up_at timestamptz null,
  last_nudged_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  unique (user_id, job_id, connection_id)
);

create index if not exists referral_outreach_due_idx on public.referral_outreach (status, follow_up_at);

alter table public.referral_outreach enable row level security;

drop policy if exists "referral_outreach owner all" on public.referral_outreach;
create policy "referral_outreach owner all"
on public.referral_outreach
as permissive
for all
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.connections c where c.id = connection_id and c.user_id = auth.uid())
);

-- 6. Query functions. security invoker so row-level security applies.
create or replace function public.get_job_contacts(p_job_id bigint)
returns table (
  connection_id bigint,
  first_name text,
  last_name text,
  linkedin_url text,
  company text,
  position_title text,
  connected_on date,
  outreach_id bigint,
  outreach_status text,
  outreach_draft text,
  asked_at timestamptz,
  follow_up_at timestamptz,
  notes text
)
language sql
stable
security invoker
as $$
  select
    c.id, c.first_name, c.last_name, c.linkedin_url, c.company, c.position_title, c.connected_on,
    o.id, o.status, o.draft, o.asked_at, o.follow_up_at, o.notes
  from public.jobs j
  join public.connections c
    on c.user_id = j.user_id
   and public.canonical_company_key(c.company_key) = public.canonical_company_key(j.company_key)
  left join public.referral_outreach o
    on o.connection_id = c.id and o.job_id = j.id and o.user_id = j.user_id
  where j.id = p_job_id
    and j.user_id = auth.uid()
    and j.company_key <> ''
  order by c.connected_on desc nulls last, c.last_name, c.first_name
$$;

create or replace function public.count_job_contacts(p_job_ids bigint[])
returns table (job_id bigint, contact_count integer)
language sql
stable
security invoker
as $$
  select j.id, count(c.id)::integer
  from public.jobs j
  join public.connections c
    on c.user_id = j.user_id
   and public.canonical_company_key(c.company_key) = public.canonical_company_key(j.company_key)
  where j.id = any (p_job_ids)
    and j.user_id = auth.uid()
    and j.company_key <> ''
  group by j.id
$$;
```

**Step 2: Check it on a throwaway local DB if Docker is available, otherwise skip to Task 4's dry run**

Run (only if `docker ps` works): `cd apps/backend && npx supabase db reset --local 2>&1 | tail -5`
Expected: ends with `Finished supabase db reset` and no SQL error. If Docker is not running, do not start it; the cloud dry run in Task 4 is the check.

**Step 3: Commit**

```bash
git add apps/backend/supabase/migrations/20261008000000_referral_contacts.sql
git commit -m "feat(db): referral contacts tables, company_key, contact queries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Company key in TypeScript, shared fixtures, parity script

**Files:**
- Create: `libraries/core/src/__fixtures__/companyKey.fixtures.json`
- Create: `libraries/core/src/__tests__/companyKey.test.ts`
- Create: `libraries/core/src/companyKey.ts`
- Modify: `libraries/core/src/index.ts`, `libraries/core/src/index.deno.ts`
- Create: `apps/backend/scripts/company-key-parity.mjs`

**Step 1: Write the fixtures**

`libraries/core/src/__fixtures__/companyKey.fixtures.json`:

```json
[
  { "input": "REI Co-op", "key": "rei" },
  { "input": "REI, Inc.", "key": "rei" },
  { "input": "The Home Depot, Inc.", "key": "home depot" },
  { "input": "Acme Corp.", "key": "acme" },
  { "input": "Acme Corporation Ltd", "key": "acme" },
  { "input": "Ford Motor Company", "key": "ford motor" },
  { "input": "The Coca-Cola Company", "key": "coca cola" },
  { "input": "AT&T", "key": "at and t" },
  { "input": "Johnson & Johnson", "key": "johnson and johnson" },
  { "input": "Meta Platforms, Inc.", "key": "meta platforms" },
  { "input": "Metaverse Labs", "key": "metaverse labs" },
  { "input": "  Stripe  ", "key": "stripe" },
  { "input": "Inc.", "key": "inc" },
  { "input": "", "key": "" },
  { "input": null, "key": "" }
]
```

Note: "Recreational Equipment, Inc." gives `recreational equipment`, not `rei`. That is intended; it is what `company_aliases` is for.

**Step 2: Write the failing test**

`libraries/core/src/__tests__/companyKey.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { companyKey, sameCompany } from '../companyKey';

const fixtures: Array<{ input: string | null; key: string }> = JSON.parse(
  readFileSync(join(__dirname, '..', '__fixtures__', 'companyKey.fixtures.json'), 'utf8'),
);

describe('companyKey', () => {
  it.each(fixtures.map((f) => [f.input, f.key] as const))('%j -> %j', (input, key) => {
    expect(companyKey(input)).toBe(key);
  });

  it('never merges look-alike names', () => {
    expect(sameCompany('Meta Platforms, Inc.', 'Metaverse Labs')).toBe(false);
  });

  it('merges spelling variants of the same company', () => {
    expect(sameCompany('REI Co-op', 'REI, Inc.')).toBe(true);
  });

  it('treats empty keys as not the same company', () => {
    expect(sameCompany('', '')).toBe(false);
    expect(sameCompany(null, undefined)).toBe(false);
  });
});
```

**Step 3: Run it to verify it fails**

Run: `cd libraries/core && npx jest --config ./jest.config.ts src/__tests__/companyKey.test.ts`
Expected: FAIL, `Cannot find module '../companyKey'`.

**Step 4: Implement**

`libraries/core/src/companyKey.ts`:

```ts
// Normalizes a company name so "REI Co-op" and "REI, Inc." compare equal.
// MUST stay identical to public.company_key in
// apps/backend/supabase/migrations/20261008000000_referral_contacts.sql.
// Shared fixtures: __fixtures__/companyKey.fixtures.json (jest here, SQL via
// apps/backend/scripts/company-key-parity.mjs).
// Limitation, shared with the SQL twin: any character outside a-z0-9 (accents,
// non-latin scripts) is treated as a space.

const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'co',
  'corp',
  'corporation',
  'company',
  'gmbh',
  'plc',
  'lp',
  'llp',
  'sa',
  'ag',
  'bv',
  'pty',
  'pllc',
]);

export function companyKey(name?: string | null): string {
  if (!name) return '';
  let s = name.toLowerCase();
  s = s.replace(/\bco-?op\b/g, ' ');
  s = s.replace(/\bcooperative\b/g, ' ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  let tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens[0] === 'the') tokens = tokens.slice(1);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(' ');
}

/** True when both names normalize to the same non-empty key (aliases are applied in SQL only). */
export function sameCompany(a?: string | null, b?: string | null): boolean {
  const keyA = companyKey(a);
  return keyA !== '' && keyA === companyKey(b);
}
```

Add to `libraries/core/src/index.ts` after the `classifyLocation` export: `export * from './companyKey';`
Add to `libraries/core/src/index.deno.ts`: `export * from './companyKey.ts';`

**Step 5: Run the test to verify it passes**

Run: `cd libraries/core && npx jest --config ./jest.config.ts src/__tests__/companyKey.test.ts`
Expected: PASS (all fixtures plus 3 behavior tests).

**Step 6: Write the SQL parity script**

`apps/backend/scripts/company-key-parity.mjs` (Node 20, run manually and before every migration push):

```js
// Checks public.company_key (SQL) against the shared fixtures.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/backend/scripts/company-key-parity.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const fixturesPath = fileURLToPath(
  new URL('../../../libraries/core/src/__fixtures__/companyKey.fixtures.json', import.meta.url),
);
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));

let failures = 0;
for (const { input, key: expected } of fixtures) {
  const res = await fetch(`${url}/rest/v1/rpc/company_key`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input }),
  });
  const actual = await res.json();
  if (actual !== expected) {
    failures++;
    console.error(`MISMATCH ${JSON.stringify(input)}: sql=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
}
console.log(failures === 0 ? `OK: ${fixtures.length} fixtures match` : `FAILED: ${failures} mismatches`);
process.exit(failures === 0 ? 0 : 1);
```

**Step 7: Typecheck and commit**

Run: `pnpm typecheck` Expected: exit 0.

```bash
git add libraries/core/src apps/backend/scripts/company-key-parity.mjs
git commit -m "feat(core): companyKey twin of the SQL function, shared fixtures, parity script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Referral helpers and DbSchema types

**Files:**
- Create: `libraries/core/src/referral.ts`
- Create: `libraries/core/src/__tests__/referral.test.ts`
- Modify: `libraries/core/src/index.ts`, `libraries/core/src/index.deno.ts`, `libraries/core/src/types.ts` (rows near line 180-200, tables near line 388, functions near line 403-430)

**Step 1: Write the failing test**

`libraries/core/src/__tests__/referral.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_FOLLOW_UP_DAYS, nextOutreachFields, selectDueOutreach } from '../referral';

const NOW = new Date('2026-10-08T12:00:00Z');

describe('nextOutreachFields', () => {
  it('sets asked_at and a follow-up date when marked asked', () => {
    const patch = nextOutreachFields('asked', NOW);
    expect(patch.status).toBe('asked');
    expect(patch.asked_at).toBe('2026-10-08T12:00:00.000Z');
    expect(patch.follow_up_at).toBe('2026-10-15T12:00:00.000Z');
    expect(DEFAULT_FOLLOW_UP_DAYS).toBe(7);
  });

  it('keeps an existing asked_at and follow_up_at', () => {
    const patch = nextOutreachFields('asked', NOW, 7, {
      asked_at: '2026-10-01T00:00:00.000Z',
      follow_up_at: '2026-10-20T00:00:00.000Z',
    });
    expect(patch.asked_at).toBe('2026-10-01T00:00:00.000Z');
    expect(patch.follow_up_at).toBe('2026-10-20T00:00:00.000Z');
  });

  it('stops nudging once there is an outcome', () => {
    for (const status of ['replied', 'referred', 'no_reply', 'declined'] as const) {
      expect(nextOutreachFields(status, NOW).follow_up_at).toBeNull();
    }
  });

  it('changes nothing but status for drafted', () => {
    expect(nextOutreachFields('drafted', NOW)).toEqual({ status: 'drafted' });
  });
});

describe('selectDueOutreach', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    status: 'asked',
    follow_up_at: '2026-10-08T00:00:00.000Z',
    last_nudged_at: null,
    ...over,
  });

  it('selects asked rows whose follow-up date has passed and were never nudged', () => {
    expect(selectDueOutreach([row({})], NOW)).toHaveLength(1);
  });

  it('skips rows not yet due, not asked, or without a follow-up date', () => {
    expect(selectDueOutreach([row({ follow_up_at: '2026-10-09T00:00:00.000Z' })], NOW)).toHaveLength(0);
    expect(selectDueOutreach([row({ status: 'replied' })], NOW)).toHaveLength(0);
    expect(selectDueOutreach([row({ follow_up_at: null })], NOW)).toHaveLength(0);
  });

  it('nudges once per follow-up date, and again if the date is pushed out and passes', () => {
    expect(selectDueOutreach([row({ last_nudged_at: '2026-10-08T06:00:00.000Z' })], NOW)).toHaveLength(0);
    expect(
      selectDueOutreach(
        [row({ follow_up_at: '2026-10-08T09:00:00.000Z', last_nudged_at: '2026-10-07T06:00:00.000Z' })],
        NOW,
      ),
    ).toHaveLength(1);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `cd libraries/core && npx jest --config ./jest.config.ts src/__tests__/referral.test.ts`
Expected: FAIL, `Cannot find module '../referral'`.

**Step 3: Implement**

`libraries/core/src/referral.ts`:

```ts
export const REFERRAL_STATUSES = ['drafted', 'asked', 'replied', 'referred', 'no_reply', 'declined'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const DEFAULT_FOLLOW_UP_DAYS = 7;

export type OutreachPatch = {
  status: ReferralStatus;
  asked_at?: string;
  follow_up_at?: string | null;
};

/**
 * Fields to write when the user changes an outreach status.
 * asked: stamp asked_at and a follow-up date (keeping any existing values).
 * replied/referred/no_reply/declined: clear the follow-up so nobody gets nudged.
 * drafted: status only.
 */
export function nextOutreachFields(
  status: ReferralStatus,
  now: Date = new Date(),
  followUpDays: number = DEFAULT_FOLLOW_UP_DAYS,
  current?: { asked_at?: string | null; follow_up_at?: string | null },
): OutreachPatch {
  if (status === 'asked') {
    const followUp = new Date(now.getTime() + followUpDays * 24 * 60 * 60 * 1000);
    return {
      status,
      asked_at: current?.asked_at ?? now.toISOString(),
      follow_up_at: current?.follow_up_at ?? followUp.toISOString(),
    };
  }
  if (status === 'drafted') return { status };
  return { status, follow_up_at: null };
}

export type DueCandidate = {
  status: string;
  follow_up_at: string | null;
  last_nudged_at: string | null;
};

/** Rows that need a follow-up nudge: asked, follow-up date passed, not yet nudged for that date. */
export function selectDueOutreach<T extends DueCandidate>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter((row) => {
    if (row.status !== 'asked' || !row.follow_up_at) return false;
    const due = new Date(row.follow_up_at).getTime();
    if (due > now.getTime()) return false;
    if (!row.last_nudged_at) return true;
    return new Date(row.last_nudged_at).getTime() < due;
  });
}
```

Add `export * from './referral';` to `index.ts` and `export * from './referral.ts';` to `index.deno.ts`.

**Step 4: Add DbSchema types in `libraries/core/src/types.ts`**

Next to `UserCvProfileRow` / `EvaluationRow` add:

```ts
export type ConnectionRow = {
  id: number;
  user_id: string;
  first_name: string;
  last_name: string;
  linkedin_url: string;
  company: string;
  company_key: string;
  position_title: string;
  connected_on: string | null;
  created_at: string;
  updated_at: string;
};

export type ReferralOutreachRow = {
  id: number;
  user_id: string;
  job_id: number;
  connection_id: number;
  status: 'drafted' | 'asked' | 'replied' | 'referred' | 'no_reply' | 'declined';
  draft: string | null;
  asked_at: string | null;
  follow_up_at: string | null;
  last_nudged_at: string | null;
  notes: string | null;
  created_at: string;
};

export type JobContact = {
  connection_id: number;
  first_name: string;
  last_name: string;
  linkedin_url: string;
  company: string;
  position_title: string;
  connected_on: string | null;
  outreach_id: number | null;
  outreach_status: ReferralOutreachRow['status'] | null;
  outreach_draft: string | null;
  asked_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
};
```

In `DbSchema.public.Tables`, after `evaluations`, add (mimic the `evaluations` entry):

```ts
connections: {
  Row: ConnectionRow;
  Insert: Pick<ConnectionRow, 'user_id' | 'linkedin_url'> &
    Partial<Omit<ConnectionRow, 'id' | 'user_id' | 'linkedin_url' | 'company_key'>>;
  Update: Partial<Omit<ConnectionRow, 'id' | 'user_id' | 'company_key'>>;
  Relationships: [];
};
referral_outreach: {
  Row: ReferralOutreachRow;
  Insert: Pick<ReferralOutreachRow, 'user_id' | 'job_id' | 'connection_id'> &
    Partial<Omit<ReferralOutreachRow, 'id' | 'user_id' | 'job_id' | 'connection_id'>>;
  Update: Partial<Omit<ReferralOutreachRow, 'id' | 'user_id' | 'job_id' | 'connection_id'>>;
  Relationships: [];
};
```

In `DbSchema.public.Functions`, add:

```ts
get_job_contacts: { Args: { p_job_id: number }; Returns: JobContact[] };
count_job_contacts: { Args: { p_job_ids: number[] }; Returns: Array<{ job_id: number; contact_count: number }> };
company_key: { Args: { name: string | null }; Returns: string };
```

**Step 5: Run tests, typecheck, commit**

Run: `cd libraries/core && npx jest --config ./jest.config.ts` Expected: all suites PASS.
Run: `pnpm typecheck` Expected: exit 0.

```bash
git add libraries/core/src
git commit -m "feat(core): referral status helpers, nudge selection, DbSchema types

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Apply the migration to the cloud project (STOP: confirm with the user first)

**Files:** none (verification only)

**Step 1: Dry run**

Run: `cd apps/backend && npx supabase db push --dry-run 2>&1 | grep -v "npm warn" | tail -6`
Expected: lists only `20261008000000_referral_contacts.sql`. If it lists anything else, stop and report.

**Step 2: Ask the user to confirm applying it to the cloud project, then apply**

Run: `cd apps/backend && npx supabase db push <<< "Y" 2>&1 | grep -v "npm warn" | tail -4`
Expected: `Applying migration 20261008000000_referral_contacts.sql...` then `Finished supabase db push.`
Run: `npx supabase migration list 2>&1 | grep 20261008`
Expected: the version appears in both the Local and Remote columns.

**Step 3: Run the SQL parity check against the cloud DB**

The service-role key lives on the Pi. Read it without printing it:

```bash
L=$(ssh maadkal@raspberrypi 'grep -E "^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" /opt/first2apply-mono/apps/backend/supabase/functions/.env')
export SUPABASE_URL=$(echo "$L" | grep ^SUPABASE_URL= | cut -d= -f2- | tr -d "\"'")
export SUPABASE_SERVICE_ROLE_KEY=$(echo "$L" | grep ^SUPABASE_SERVICE_ROLE_KEY= | cut -d= -f2- | tr -d "\"'")
node apps/backend/scripts/company-key-parity.mjs
```
Expected: `OK: 15 fixtures match`. Any MISMATCH means the SQL and TS twins differ: fix the SQL in a new migration (never edit the applied one) or fix the TS, and rerun both Task 2 tests.

**Step 3b: Check jobs backfill**

Run: `curl -s "$SUPABASE_URL/rest/v1/jobs?select=companyName,company_key&limit=3" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"`
Expected: each row has a non-empty `company_key` derived from `companyName`.

**Step 4: Write and run the row-level security check**

Create `apps/backend/scripts/referral-rls-check.mjs`:

```js
// Proves one user cannot read or write another user's connections or referral_outreach.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node apps/backend/scripts/referral-rls-check.mjs
// Creates two throwaway users and deletes them at the end.
const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !service || !anon) {
  console.error('set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY');
  process.exit(2);
}

const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const stamp = Date.now();
const password = `Tmp-${stamp}-pw!`;

async function createUser(label) {
  const email = `rls-${label}-${stamp}@first2apply-qa.example.com`;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { access_token } = await login.json();
  return { id: user.id, headers: { apikey: anon, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } };
}

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures++;
};

const a = await createUser('a');
const b = await createUser('b');
try {
  const insert = await fetch(`${url}/rest/v1/connections`, {
    method: 'POST',
    headers: { ...a.headers, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: a.id, linkedin_url: `https://linkedin.com/in/rls-${stamp}`, company: 'RLS Co' }),
  });
  const [row] = await insert.json();
  check('owner can insert a connection', !!row?.id);

  const bRead = await (await fetch(`${url}/rest/v1/connections?select=id`, { headers: b.headers })).json();
  check('other user cannot read it', Array.isArray(bRead) && bRead.length === 0);

  const bForge = await fetch(`${url}/rest/v1/connections`, {
    method: 'POST',
    headers: b.headers,
    body: JSON.stringify({ user_id: a.id, linkedin_url: `https://linkedin.com/in/forged-${stamp}` }),
  });
  check('other user cannot insert rows as the owner', bForge.status >= 400);

  const bOutreach = await fetch(`${url}/rest/v1/referral_outreach`, {
    method: 'POST',
    headers: b.headers,
    body: JSON.stringify({ user_id: b.id, job_id: 1, connection_id: row.id }),
  });
  check('other user cannot attach outreach to a connection they do not own', bOutreach.status >= 400);
} finally {
  for (const u of [a, b]) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
  }
}
console.log(failures === 0 ? 'OK' : `FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
```

Run it with the anon key from `apps/desktopProbe/.env` (`SUPABASE_KEY`, read it without printing): `SUPABASE_ANON_KEY=$(grep ^SUPABASE_KEY= apps/desktopProbe/.env | cut -d= -f2-) node apps/backend/scripts/referral-rls-check.mjs`
Expected: four `PASS` lines then `OK`.

**Step 5: Commit**

```bash
git add apps/backend/scripts
git commit -m "test(db): parity and row-level security checks for referral tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Desktop IPC handlers and renderer wrappers (contacts only)

**Files:**
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts` (add handlers next to `tailor-cv`, about line 917)
- Modify: `apps/desktopProbe/src/lib/electronMainSdk.tsx` (add wrappers near `tailorCv`, about line 828)

**Step 1: Add the IPC handlers**

Mimic the `list-job-evaluations` handler (about line 930), which reads tables through `supabaseApi.getSupabaseClient()` and returns through `_apiCall`. Add:

```ts
ipcMain.handle(
  'save-connections',
  async (
    _e,
    { rows }: { rows: Array<{ firstName: string; lastName: string; url: string; company: string; position: string; connectedOnIso: string | null }> },
  ) =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error('not signed in');
      const userId = userData.user.id;

      const usable = rows.filter((r) => r.url.trim() !== '');
      const skippedNoUrl = rows.length - usable.length;
      const now = new Date().toISOString();
      const payload = usable.map((r) => ({
        user_id: userId,
        first_name: r.firstName,
        last_name: r.lastName,
        linkedin_url: r.url.trim(),
        company: r.company,
        position_title: r.position,
        connected_on: r.connectedOnIso,
        updated_at: now,
      }));

      // Existing urls tell us how many rows were updates versus new people.
      const { data: existing, error: existingError } = await supabase
        .from('connections')
        .select('linkedin_url')
        .eq('user_id', userId);
      if (existingError) throw existingError;
      const known = new Set((existing ?? []).map((e: { linkedin_url: string }) => e.linkedin_url));

      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase
          .from('connections')
          .upsert(payload.slice(i, i + 500), { onConflict: 'user_id,linkedin_url' });
        if (error) throw error;
      }
      const updated = payload.filter((p) => known.has(p.linkedin_url)).length;
      return { saved: payload.length, created: payload.length - updated, updated, skippedNoUrl };
    }),
);

ipcMain.handle('count-job-contacts', async (_e, { jobIds }: { jobIds: number[] }) =>
  _apiCall(async () => {
    if (jobIds.length === 0) return { rows: [] as Array<{ job_id: number; contact_count: number }> };
    const supabase = supabaseApi.getSupabaseClient();
    const { data, error } = await supabase.rpc('count_job_contacts', { p_job_ids: jobIds });
    if (error) throw error;
    return { rows: (data ?? []) as Array<{ job_id: number; contact_count: number }> };
  }),
);

ipcMain.handle('get-job-contacts', async (_e, { jobId }: { jobId: number }) =>
  _apiCall(async () => {
    const supabase = supabaseApi.getSupabaseClient();
    const { data, error } = await supabase.rpc('get_job_contacts', { p_job_id: jobId });
    if (error) throw error;
    return { contacts: data ?? [] };
  }),
);
```

If TypeScript rejects a call because the client type does not know the new tables or functions yet, cast the client the same way `list-job-evaluations` does (`as any`) and leave a one-line comment saying why.

**Step 2: Add the renderer wrappers**

In `electronMainSdk.tsx`, mimic `tailorCv` (about line 828) and `listJobEvaluations` (line 852). `_mainProcessApiCall` is the helper at lines 23-29.

```ts
export type SaveConnectionsResult = { saved: number; created: number; updated: number; skippedNoUrl: number };

export async function saveConnections(
  rows: Array<{ firstName: string; lastName: string; url: string; company: string; position: string; connectedOnIso: string | null }>,
): Promise<SaveConnectionsResult> {
  return _mainProcessApiCall('save-connections', { rows });
}

export async function countJobContacts(jobIds: number[]): Promise<{ rows: Array<{ job_id: number; contact_count: number }> }> {
  return _mainProcessApiCall('count-job-contacts', { jobIds });
}

export async function getJobContacts(jobId: number): Promise<{ contacts: JobContact[] }> {
  return _mainProcessApiCall('get-job-contacts', { jobId });
}
```

Import `JobContact` from `@first2apply/core` at the top of the file.

**Step 3: Typecheck**

Run: `pnpm --filter first2apply-desktop typecheck` Expected: exit 0.

**Step 4: Commit**

```bash
git add apps/desktopProbe/src
git commit -m "feat(desktop): IPC for saving connections and counting job contacts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Connections page Save, route, and navbar

**Files:**
- Modify: `apps/desktopProbe/src/pages/connections.tsx` (replace the file)
- Modify: `apps/desktopProbe/src/app.tsx` (routes at lines 86-105)
- Modify: `apps/desktopProbe/src/components/navbar.tsx` (items array, about lines 55-75)

**Step 1: Replace `connections.tsx`**

The enrichment stub (`enrich.ts`) is no longer used by this page. Leave the module in place (out of scope).

```tsx
// LinkedIn connections import. CSV parsing runs in the renderer, Save upserts into the
// per-user `connections` table (re-importing updates people, it never deletes anyone).

import { Button, Label } from '@first2apply/ui';
import { companyKey } from '@first2apply/core';
import { useMemo, useState } from 'react';

import { saveConnections, type SaveConnectionsResult } from '@/lib/electronMainSdk';
import { parseConnectionsCsv, type Connection } from '@/server/connections/csv';

import { DefaultLayout } from './defaultLayout';

export function ConnectionsPage() {
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Connection[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveConnectionsResult | null>(null);

  const onFile = async (f: File) => {
    setError(null);
    setWarnings([]);
    setRows([]);
    setResult(null);
    setFilename(f.name);
    try {
      const { connections, warnings } = parseConnectionsCsv(await f.text());
      setRows(connections);
      setWarnings(warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      setResult(
        await saveConnections(
          rows.map((r) => ({
            firstName: r.firstName,
            lastName: r.lastName,
            url: r.url,
            company: r.company,
            position: r.position,
            connectedOnIso: r.connectedOnIso,
          })),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const companyCount = useMemo(() => new Set(rows.map((r) => companyKey(r.company)).filter(Boolean)).size, [rows]);

  return (
    <DefaultLayout className="space-y-4 p-6 md:p-10">
      <h1 className="text-2xl font-medium tracking-wide">LinkedIn connections</h1>
      <p className="text-sm font-light">
        Export your LinkedIn connections as CSV (Settings, Data privacy, Get a copy of your data, Connections), then
        upload it here and press Save. Jobs at companies where you know someone get a contacts badge. Email addresses
        are never stored.
      </p>

      <div className="space-y-4 rounded-lg border p-6">
        <div className="space-y-1">
          <Label htmlFor="cx-file">CSV file</Label>
          <input
            id="cx-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {filename && <p className="text-xs font-light">selected: {filename}</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm">
              Parsed <b>{rows.length}</b> connections across <b>{companyCount}</b> companies.
              {warnings.length > 0 && <span className="ml-2 text-yellow-600">{warnings.length} warnings.</span>}
            </p>
            <Button onClick={() => void onSave()} disabled={saving} data-testid="save-connections">
              {saving ? 'Saving...' : 'Save connections'}
            </Button>
            {result && (
              <p className="text-sm" data-testid="save-result">
                Saved {result.saved}: {result.created} new, {result.updated} updated
                {result.skippedNoUrl > 0 && `, ${result.skippedNoUrl} skipped (no profile URL)`}.
              </p>
            )}
            <div className="max-h-64 overflow-auto rounded border text-xs">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Company</th>
                    <th className="p-2 text-left">Position</th>
                    <th className="p-2 text-left">Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="p-2">{r.company}</td>
                      <td className="p-2">{r.position}</td>
                      <td className="p-2">{r.connectedOnIso ?? r.connectedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && <p className="text-xs font-light">Showing the first 100 of {rows.length}.</p>}
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}
```

**Step 2: Route and navbar**

In `app.tsx`, next to the `/my-cv` route (about line 86-105), add:

```tsx
<Route path="/connections" element={<AuthGuardedComponent component={ConnectionsPage} />} />
```
and the import `import { ConnectionsPage } from './pages/connections';`.

In `navbar.tsx`, after the `My CV` gated item (about lines 64-72), add an ungated item (the badge works without career ops). Use the same icon library already imported there (the file imports `FileTextIcon`; pick `UsersIcon` from the same package if it exports one, otherwise reuse `FileTextIcon`):

```tsx
{ name: 'Contacts', path: '/connections', icon: <UsersIcon className="h-7 w-7" /> },
```

**Step 3: Typecheck, run the app tests, commit**

Run: `pnpm --filter first2apply-desktop typecheck && pnpm --filter first2apply-desktop test`
Expected: typecheck exit 0, vitest 21 passed.

```bash
git add apps/desktopProbe/src
git commit -m "feat(desktop): save LinkedIn connections, add Contacts page route and nav item

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Contacts badge on job cards and the "People you know here" panel (no drafting yet)

**Files:**
- Create: `apps/desktopProbe/src/components/home/jobContacts.tsx`
- Modify: `apps/desktopProbe/src/components/home/jobTabsContent.tsx` (counts effect near line 107; `JobsList` at line 534; detail panel at lines 565-585)
- Modify: `apps/desktopProbe/src/components/home/jobsList.tsx` and the job card component it renders (line 167)

**Step 1: Create the components**

```tsx
import { JobContact, REFERRAL_STATUSES, ReferralStatus, nextOutreachFields } from '@first2apply/core';
import { Button } from '@first2apply/ui';
import { useEffect, useState } from 'react';

import { getJobContacts } from '@/lib/electronMainSdk';

export function ContactBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="contact-badge"
      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
    >
      {count} {count === 1 ? 'contact' : 'contacts'}
    </span>
  );
}

function connectedFor(connectedOn: string | null): string {
  if (!connectedOn) return '';
  const months = Math.floor((Date.now() - new Date(connectedOn).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'connected this month';
  if (months < 24) return `connected ${months} months ago`;
  return `connected ${Math.floor(months / 12)} years ago`;
}

export function JobContactsPanel({ jobId }: { jobId: number }) {
  const [contacts, setContacts] = useState<JobContact[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContacts(null);
    getJobContacts(jobId)
      .then((r) => !cancelled && setContacts(r.contacts))
      .catch((): void => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!contacts || contacts.length === 0) return null;

  return (
    <section data-testid="job-contacts" className="space-y-3 rounded-lg border p-4">
      <h3 className="text-lg font-medium">People you know here</h3>
      <ul className="space-y-3">
        {contacts.map((c) => (
          <ContactRow key={c.connection_id} jobId={jobId} contact={c} />
        ))}
      </ul>
    </section>
  );
}

function ContactRow({ jobId, contact }: { jobId: number; contact: JobContact }) {
  const [status, setStatus] = useState<ReferralStatus | ''>(contact.outreach_status ?? '');

  const onStatus = async (next: ReferralStatus) => {
    setStatus(next);
    // Persisted in Task 11 through updateReferralOutreach; the patch rules live in core.
    void nextOutreachFields(next);
  };

  return (
    <li data-testid="job-contact" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>
            {contact.first_name} {contact.last_name}
          </b>
          <span className="ml-2 font-light">{contact.position_title}</span>
          <span className="ml-2 text-xs font-light">{connectedFor(contact.connected_on)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(contact.linkedin_url, '_blank', 'noopener')}
          >
            Open LinkedIn profile
          </Button>
          <select
            aria-label={`Outreach status for ${contact.first_name}`}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={status}
            onChange={(e) => void onStatus(e.target.value as ReferralStatus)}
          >
            <option value="" disabled>
              Not contacted
            </option>
            {REFERRAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
}
```

Note: the status select does not persist yet. Task 11 replaces `onStatus` with a call to a new `updateReferralOutreach` wrapper. Do not ship Task 7 alone with a select that silently does nothing: either land Tasks 7 and 11 together, or temporarily render the select `disabled`. Choose `disabled` for the Task 7 commit and remove `disabled` in Task 11.

**Step 2: Wire the badge into the job list**

1. In `jobTabsContent.tsx`, beside the evaluations effect (lines 107-124), add the same pattern for counts (no career-ops gate, the badge works without it):

```tsx
const [contactCounts, setContactCounts] = useState<Map<number, number>>(new Map());

useEffect(() => {
  if (listing.jobs.length === 0) return;
  const ids = listing.jobs.map((j) => j.id);
  let cancelled = false;
  countJobContacts(ids)
    .then((r) => {
      if (cancelled) return;
      setContactCounts((prev) => {
        const next = new Map(prev);
        for (const row of r.rows) next.set(row.job_id, row.contact_count);
        return next;
      });
    })
    .catch((): void => undefined);
  return () => {
    cancelled = true;
  };
}, [listing.jobs.map((j) => j.id).join(',')]);
```
   and import `countJobContacts` from `@/lib/electronMainSdk`.
2. Pass `contactCounts={contactCounts}` to `<JobsList ... />` (line 534).
3. In `jobsList.tsx` add `contactCounts?: Map<number, number>` to the props and pass `contactCount={contactCounts?.get(job.id) ?? 0}` to `<JobCard ... />` (line 167). In the job card component add `contactCount?: number` and render `<ContactBadge count={contactCount ?? 0} />` next to the company name. Read both files first and match their prop style.
4. In the detail panel (lines 565-585), render `<JobContactsPanel jobId={selectedJob.id} />` between `JobSummary` and `JobNotes`, wrapped so it appears only when `careerOpsEnabled` is true:

```tsx
{careerOpsEnabled && <JobContactsPanel jobId={selectedJob.id} />}
```

**Step 3: Typecheck and unit tests**

Run: `pnpm --filter first2apply-desktop typecheck && pnpm --filter first2apply-desktop test`
Expected: exit 0, 21 tests pass.

**Step 4: Commit**

```bash
git add apps/desktopProbe/src
git commit -m "feat(desktop): contacts badge on job cards and People you know here panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: QA seed data and Playwright spec for contacts

**Files:**
- Modify: `qa/seed-qa-account.sh` (append after the jobs block, about line 84)
- Create: `qa/ui/03-referrals.spec.ts`

**Step 1: Extend the seed script (idempotent)**

Append before the script's final line:

```bash
# connections: two people at "QA Co A" (matches job "QA Remote Engineer") and one at "QA Co B, Inc."
# (matches "QA Co B" through company_key normalization). Never any email.
conn_count="$(api "$SUPABASE_URL/rest/v1/connections?select=id&user_id=eq.$uid" | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')"
if [ "$conn_count" -eq 0 ]; then
  python3 - "$uid" > /tmp/f2a_qa_connections.json <<'PY'
import json, sys
uid = sys.argv[1]
rows = [
    ("Avery", "Stone", "QA Co A", "Engineering Manager", "2024-02-01"),
    ("Jordan", "Reyes", "QA Co A", "Recruiter", "2025-06-15"),
    ("Sam", "Okafor", "QA Co B, Inc.", "Analyst", "2023-11-20"),
]
print(json.dumps([
    {"user_id": uid, "first_name": f, "last_name": l, "company": c, "position_title": p, "connected_on": d,
     "linkedin_url": f"https://www.linkedin.com/in/qa-{f.lower()}-{l.lower()}"}
    for f, l, c, p, d in rows
]))
PY
  api -X POST "$SUPABASE_URL/rest/v1/connections" -H "Prefer: return=minimal" -d @/tmp/f2a_qa_connections.json > /dev/null
  rm -f /tmp/f2a_qa_connections.json
  echo "seeded 3 QA connections"
else
  echo "QA connections already present ($conn_count)"
fi
```

Also update the header comment of the script to list the connections fixture.

**Step 2: Write the spec**

`qa/ui/03-referrals.spec.ts` (mirror the login steps of `02-authenticated.spec.ts`; reuse `launchApp`, `shot`, `hasCreds`, `appBinaryExists` from `./fixtures`):

```ts
import { expect, test } from '@playwright/test';

import { LaunchedApp, appBinaryExists, hasCreds, launchApp, shot } from './fixtures';

test.skip(!hasCreds, 'F2A_QA_EMAIL and F2A_QA_PASSWORD are not set, skipping authenticated specs');
test.skip(!appBinaryExists(), 'packaged app not built');
test.describe.configure({ mode: 'serial' });

test.describe('referral contacts', () => {
  let ctx: LaunchedApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    const { page } = ctx;
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.getByLabel('Email').fill(process.env.F2A_QA_EMAIL as string);
    await page.getByLabel('Password').fill(process.env.F2A_QA_PASSWORD as string);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('nav a[href="/links"]')).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('job at a company with contacts shows the badge and the panel', async () => {
    const { page } = ctx;
    await page.locator('nav a[href="/"]').last().click();
    // "QA Co A" has two seeded contacts.
    await expect(page.getByTestId('contact-badge').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('contact-badge').filter({ hasText: '2 contacts' })).toHaveCount(1);
    await page.getByText('QA Remote Engineer').first().click();
    await expect(page.getByTestId('job-contacts')).toBeVisible();
    await expect(page.getByTestId('job-contact')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Open LinkedIn profile' }).first()).toBeVisible();
    await shot(page, 'referrals-panel');
  });

  test('normalization links "QA Co B, Inc." contacts to jobs at "QA Co B"', async () => {
    const { page } = ctx;
    await page.getByText('QA Hybrid Analyst').first().click();
    await expect(page.getByTestId('job-contact')).toHaveCount(1);
  });

  test('a job at a company with no contacts shows no panel', async () => {
    const { page } = ctx;
    await page.getByText('QA Onsite Technician').first().click();
    await expect(page.getByTestId('job-contacts')).toHaveCount(0);
  });
});
```

**Step 3: Seed, build, run**

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...   # as in Task 4 Step 3
qa/seed-qa-account.sh          # expect "seeded 3 QA connections", then rerun: "already present (3)"
qa/run-qa.sh ui                # QA login loads from the Keychain
```
Expected: the three new specs PASS along with the existing ones, `RESULT: PASS (no new failures)`. If `contact-badge` is not found, check the job card edit from Task 7 Step 2.

**Step 4: Commit**

```bash
git add qa
git commit -m "test(qa): seed connections and add referral contacts UI spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Draft generation module (pure, tested)

**Files:**
- Create: `apps/backend/supabase/functions/_shared/referralDraft.ts`
- Create: `apps/backend/supabase/functions/_shared/referralDraft.test.ts`
- Modify: `apps/backend/supabase/functions/_shared/careerOpsPrompts.ts` (append a prompt)
- Modify: `qa/run-qa.sh` (add the test file to the deno test line, about line 195)

**Step 1: Write the failing test**

`referralDraft.test.ts`:

```ts
import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';

import { buildReferralUserMessage, cleanDraft, connectionAgeText, generateReferralDraft } from './referralDraft.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const input = {
  contactFirstName: 'Avery',
  contactPosition: 'Engineering Manager',
  contactCompany: 'QA Co A',
  connectedOnIso: '2024-02-01',
  jobTitle: 'Senior Support Engineer',
  jobCompany: 'QA Co A',
  jobDescription: 'Help customers. Python and SQL.',
  cvMarkdown: '# Jacob\n- 6 years of technical support\n- Python, SQL',
  now: NOW,
};

Deno.test('connectionAgeText buckets the time since connecting', () => {
  assertEquals(connectionAgeText('2026-10-01', NOW), 'less than a month');
  assertEquals(connectionAgeText('2026-07-08', NOW), 'about 3 months');
  assertEquals(connectionAgeText('2024-02-01', NOW), 'about 2 years');
  assertEquals(connectionAgeText(null, NOW), 'unknown');
});

Deno.test('the user message carries only first name, position and company for the contact', () => {
  const msg = buildReferralUserMessage({ ...input, contactLastName: 'Stone', contactUrl: 'https://linkedin.com/in/x' } as never);
  assertStringIncludes(msg, 'Avery');
  assertStringIncludes(msg, 'Engineering Manager');
  assert(!msg.includes('Stone'), 'last name must not be sent to the model');
  assert(!msg.includes('linkedin.com'), 'profile url must not be sent to the model');
});

Deno.test('cleanDraft strips quotes, preamble labels and extra whitespace', () => {
  assertEquals(cleanDraft('  "Hi Avery,\n\n\nthanks!"  '), 'Hi Avery,\n\nthanks!');
  assertEquals(cleanDraft('Message: Hi Avery'), 'Hi Avery');
});

const fakeClient = (content: string | null) => ({
  openAi: {
    chat: {
      completions: {
        create: () =>
          Promise.resolve({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }),
      },
    },
  },
  llmConfig: { model: 'fake', costPerMillionInputTokens: 0, costPerMillionOutputTokens: 0 },
});

Deno.test('generateReferralDraft returns the cleaned draft', async () => {
  const { draft } = await generateReferralDraft({ ...fakeClient('"Hi Avery, quick question."'), input });
  assertEquals(draft, 'Hi Avery, quick question.');
});

Deno.test('generateReferralDraft rejects an empty model reply', async () => {
  await assertRejects(() => generateReferralDraft({ ...fakeClient('   '), input }), Error, 'empty');
});
```

**Step 2: Run it to verify it fails**

Run: `cd apps/backend/supabase/functions && deno test -A --no-check --sloppy-imports _shared/referralDraft.test.ts`
Expected: FAIL, module not found.

**Step 3: Implement**

Append to `careerOpsPrompts.ts` (same plain-string style as `tailorCvSystemPrompt`):

```ts
export const referralDraftSystemPrompt = `You write a short message from a job seeker to someone they already know, asking for a referral or a conversation about a role at that person's company.

Rules:
- Under 120 words. Warm, direct, specific. Plain text only.
- Ask for a referral or a short conversation. Do not ask for a favor you cannot back up.
- Mention exactly one concrete strength from the candidate CV that fits the role.
- Use only facts from the CV and the job description. Never invent employers, numbers, projects or shared history.
- Mention how long they have been connected only if it makes the message more natural.
- Do not include links, placeholders in brackets, a subject line, or a signature block.
- Output only the message text, with no preamble or explanation.`;
```

`referralDraft.ts`:

```ts
import { referralDraftSystemPrompt } from './careerOpsPrompts.ts';

// Structural types on purpose: importing openAI.ts would parse env at import time and break tests.
type ChatClient = {
  chat: {
    completions: {
      create: (args: Record<string, unknown>) => Promise<{
        choices: Array<{ finish_reason?: string | null; message: { content: string | null } }>;
        usage?: unknown;
      }>;
    };
  };
};
type LlmConfig = { model: string; costPerMillionInputTokens: number; costPerMillionOutputTokens: number };

export type ReferralDraftInput = {
  contactFirstName: string;
  contactPosition: string;
  contactCompany: string;
  connectedOnIso: string | null;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string | null;
  cvMarkdown: string;
  now?: Date;
};

const MAX_DESCRIPTION_CHARS = 6000;
const MAX_CV_CHARS = 8000;

export function connectionAgeText(connectedOnIso: string | null, now: Date = new Date()): string {
  if (!connectedOnIso) return 'unknown';
  const months = Math.floor((now.getTime() - new Date(connectedOnIso).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'less than a month';
  if (months < 24) return `about ${months} months`;
  return `about ${Math.floor(months / 12)} years`;
}

/** Only the contact's first name, position and company are included, never the last name or profile url. */
export function buildReferralUserMessage(input: ReferralDraftInput): string {
  return [
    `CONTACT: ${input.contactFirstName}, ${input.contactPosition} at ${input.contactCompany}`,
    `CONNECTED FOR: ${connectionAgeText(input.connectedOnIso, input.now)}`,
    '',
    `JOB: ${input.jobTitle} at ${input.jobCompany}`,
    (input.jobDescription ?? '').slice(0, MAX_DESCRIPTION_CHARS),
    '',
    'CANDIDATE CV:',
    input.cvMarkdown.slice(0, MAX_CV_CHARS),
  ].join('\n');
}

export function cleanDraft(text: string): string {
  let out = text.trim();
  out = out.replace(/^(message|draft)\s*:\s*/i, '');
  out = out.replace(/^["'“”]+|["'“”]+$/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export async function generateReferralDraft({
  openAi,
  llmConfig,
  input,
}: {
  openAi: ChatClient;
  llmConfig: LlmConfig;
  input: ReferralDraftInput;
}) {
  const response = await openAi.chat.completions.create({
    model: llmConfig.model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: referralDraftSystemPrompt },
      { role: 'user', content: buildReferralUserMessage(input) },
    ],
  });
  const draft = cleanDraft(response.choices[0]?.message?.content ?? '');
  if (!draft) throw new Error('model returned an empty draft');
  return { draft, response };
}
```

**Step 4: Run the test to verify it passes, add it to the QA unit tier**

Run: `cd apps/backend/supabase/functions && deno test -A --no-check --sloppy-imports _shared/referralDraft.test.ts`
Expected: 5 passed. Then `git checkout deno.lock` if deno rewrote it.
In `qa/run-qa.sh` change the deno test line to also pass `_shared/referralDraft.test.ts`. Run `qa/run-qa.sh unit`. Expected: PASS (no new failures).

**Step 5: Commit**

```bash
git add apps/backend/supabase/functions/_shared qa/run-qa.sh
git commit -m "feat(edge): referral draft prompt and generator with tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 10: `draft-referral` edge function and Pi router (STOP: confirm before deploying to the Pi)

**Files:**
- Create: `apps/backend/supabase/functions/draft-referral/index.ts`
- Modify: `apps/backend/supabase/functions/_localServer.ts` (import near lines 18-23, a `case` in the switch at lines 66-82)

**Step 1: Write the function** (same skeleton as `tailor-cv`)

```ts
import { getExceptionMessage } from '@first2apply/core';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';
import { buildOpenAiClient, logAiUsage } from '../_shared/openAI.ts';
import { generateReferralDraft } from '../_shared/referralDraft.ts';

type DraftReferralBody = { job_id: number; connection_id: number };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
const fail = (code: string, message: string) => json({ error: { code, message } });

export const handle = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const logger = createLoggerWithMeta({ function: 'draft-referral' });
  try {
    const context = await getEdgeFunctionContext({ logger, req, checkAuthorization: true });
    const { supabaseClient, supabaseAdminClient, user } = context;
    if (!user) return fail('unauthenticated', 'No user');

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('career_ops_enabled')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.career_ops_enabled) return fail('feature_disabled', 'career_ops_enabled is off');

    const { job_id, connection_id } = (await req.json()) as DraftReferralBody;
    if (!job_id || !connection_id) throw new Error('job_id and connection_id are required');

    // The contact must be one of this user's contacts at the job's company (also proves ownership).
    const { data: contacts, error: contactsError } = await supabaseClient.rpc('get_job_contacts', { p_job_id: job_id });
    if (contactsError) throw contactsError;
    const contact = (contacts ?? []).find((c: { connection_id: number }) => c.connection_id === connection_id);
    if (!contact) return fail('contact_not_at_company', 'That contact is not at this job\'s company.');

    const { data: job, error: jobError } = await supabaseClient
      .from('jobs')
      .select('id, title, companyName, description')
      .eq('id', job_id)
      .single();
    if (jobError) throw jobError;

    // Prefer the CV tailored for this job, fall back to the master CV.
    const { data: evaluation } = await supabaseClient
      .from('evaluations')
      .select('tailored_cv')
      .eq('job_id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();
    let cvMarkdown: string | null = evaluation?.tailored_cv ?? null;
    if (!cvMarkdown) {
      const { data: cvRow, error: cvError } = await supabaseClient
        .from('user_cv_profiles')
        .select('markdown')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cvError) throw cvError;
      cvMarkdown = cvRow?.markdown ?? null;
    }
    if (!cvMarkdown) return fail('no_master_cv', 'Upload a master CV first.');

    const { openAi, llmConfig } = buildOpenAiClient({ modelName: 'gpt-4o-mini' });
    const { draft, response } = await generateReferralDraft({
      openAi,
      llmConfig,
      input: {
        contactFirstName: contact.first_name,
        contactPosition: contact.position_title,
        contactCompany: contact.company,
        connectedOnIso: contact.connected_on,
        jobTitle: job.title,
        jobCompany: job.companyName,
        jobDescription: job.description,
        cvMarkdown,
      },
    });
    await logAiUsage({ logger, supabaseAdminClient, forUserId: user.id, llmConfig, response });

    // Regenerating keeps an existing status (for example "asked"), a new row starts as "drafted".
    const { data: existing, error: existingError } = await supabaseClient
      .from('referral_outreach')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', job_id)
      .eq('connection_id', connection_id)
      .maybeSingle();
    if (existingError) throw existingError;

    const write = existing
      ? supabaseClient.from('referral_outreach').update({ draft }).eq('id', existing.id).select().single()
      : supabaseClient
          .from('referral_outreach')
          .insert({ user_id: user.id, job_id, connection_id, draft, status: 'drafted' })
          .select()
          .single();
    const { data: row, error: writeError } = await write;
    if (writeError) throw writeError;

    return json({ outreach: row });
  } catch (error) {
    logger.error(`draft-referral failed: ${getExceptionMessage(error)}`);
    return fail('draft_failed', getExceptionMessage(error, true));
  }
};

if (import.meta.main) Deno.serve(handle);
```

If the typechecker objects to a column or table, fix the `DbSchema` types from Task 3 rather than casting.

**Step 2: Register in the Pi router**

In `_localServer.ts` add `import { handle as draftReferralHandle } from './draft-referral/index.ts';` beside the other imports and, in the `switch (fnName)`, next to `tailor-cv`:

```ts
case 'draft-referral':
  return draftReferralHandle(req);
```

**Step 3: Typecheck and unit QA**

Run: `pnpm --filter @first2apply/backend typecheck && qa/run-qa.sh unit`
Expected: typecheck exit 0, `RESULT: PASS (no new failures)`.

**Step 4: Commit, then ask the user to confirm the Pi deploy**

```bash
git add apps/backend/supabase/functions
git commit -m "feat(edge): draft-referral function and Pi router entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

After the user confirms, deploy to the Pi (edge functions are rsynced, not shipped in the image):

```bash
rsync -rlt -e "ssh -o BatchMode=yes" --exclude '.env' --exclude 'deno.lock' --exclude node_modules \
  apps/backend/supabase/functions/ maadkal@raspberrypi:/opt/first2apply-mono/apps/backend/supabase/functions/
rsync -rlt --delete -e "ssh -o BatchMode=yes" --exclude node_modules --exclude build --exclude dist \
  libraries/core/ maadkal@raspberrypi:/opt/first2apply-mono/libraries/core/
ssh maadkal@raspberrypi 'docker restart f2a-edge-local >/dev/null; for i in $(seq 1 15); do curl -fsS -m 3 http://127.0.0.1:54321/functions/v1/health && break; sleep 3; done'
```
Expected: `{"ok":true}`. Then check the logs for import errors: `ssh maadkal@raspberrypi 'docker logs --tail 15 f2a-edge-local 2>&1 | grep -i "error\|module not found"'` Expected: no output.

Note for the cloud-provider backlog item: `draft-referral` goes through `buildOpenAiClient`, so it follows whatever provider is configured.

---

## Task 11: Desktop drafting UI and persisted status

**Files:**
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts` (next to `tailor-cv`)
- Modify: `apps/desktopProbe/src/lib/electronMainSdk.tsx`
- Modify: `apps/desktopProbe/src/components/home/jobContacts.tsx`

**Step 1: IPC handlers**

```ts
ipcMain.handle('draft-referral', async (_e, { jobId, connectionId }: { jobId: number; connectionId: number }) =>
  _apiCall(async () => {
    const supabase = supabaseApi.getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<{
      outreach?: { id: number; draft: string | null; status: string };
      error?: { code: string; message: string };
    }>('draft-referral', { body: { job_id: jobId, connection_id: connectionId } });
    if (error) throw error;
    if (data?.error) throw new Error(`${data.error.code}: ${data.error.message}`);
    return data;
  }),
);

ipcMain.handle(
  'update-referral-outreach',
  async (
    _e,
    { jobId, connectionId, patch }: { jobId: number; connectionId: number; patch: Record<string, unknown> },
  ) =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error('not signed in');
      const { data, error } = await supabase
        .from('referral_outreach')
        .upsert(
          { user_id: userData.user.id, job_id: jobId, connection_id: connectionId, ...patch },
          { onConflict: 'user_id,job_id,connection_id' },
        )
        .select()
        .single();
      if (error) throw error;
      return { outreach: data };
    }),
);
```

**Step 2: Renderer wrappers** (`electronMainSdk.tsx`)

```ts
export async function draftReferral(jobId: number, connectionId: number): Promise<{ outreach?: { id: number; draft: string | null; status: string } }> {
  return _mainProcessApiCall('draft-referral', { jobId, connectionId });
}

export async function updateReferralOutreach(jobId: number, connectionId: number, patch: Record<string, unknown>) {
  return _mainProcessApiCall('update-referral-outreach', { jobId, connectionId, patch });
}
```

**Step 3: Replace `ContactRow` in `jobContacts.tsx`**

Replace the Task 7 placeholder `ContactRow` with a version that:
- keeps local state `draft`, `drafting`, `draftError`, `status`, `followUpAt`;
- **Draft message** button: sets `drafting`, calls `draftReferral(jobId, contact.connection_id)`, stores `outreach.draft` in state, shows `draftError` with a **Retry** button on failure and leaves any existing draft untouched;
- an editable `<textarea data-testid="referral-draft">` bound to `draft`, with a **Copy** button (`navigator.clipboard.writeText(draft)`) and a **Save edits** button calling `updateReferralOutreach(jobId, connectionId, { draft })`;
- a status select whose `onChange` calls `updateReferralOutreach(jobId, connectionId, nextOutreachFields(next, new Date(), DEFAULT_FOLLOW_UP_DAYS, { asked_at: contact.asked_at, follow_up_at: contact.follow_up_at }))`, updating local `status` and `followUpAt` from the patch;
- when status is `asked`, an `<input type="date" aria-label="Follow-up date">` showing `followUpAt` that calls `updateReferralOutreach(..., { follow_up_at: <iso> })` on change;
- the `disabled` attribute from Task 7 removed.

Spinner text while drafting: "Drafting, this can take a minute on the local model". Do not add any "send" action.

**Step 4: Typecheck and tests**

Run: `pnpm --filter first2apply-desktop typecheck && pnpm --filter first2apply-desktop test`
Expected: exit 0, 21 passed.

**Step 5: Manual smoke test on the QA account**

Package and run the UI tier (`qa/run-qa.sh ui`). Then, with the app open as the QA user (Keychain login), open "QA Remote Engineer", press **Draft message** for Avery, confirm text appears, **Copy** works, set status to **asked**, and confirm a follow-up date 7 days out appears. This needs a master CV on the QA account; if the draft fails with `no_master_cv`, upload one in My CV first.

**Step 6: Commit**

```bash
git add apps/desktopProbe/src
git commit -m "feat(desktop): draft referral messages and persist outreach status

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 12: Pi follow-up nudge

**Files:**
- Create: `apps/serverProbe/src/referralNudge.ts`
- Create: `apps/serverProbe/src/__tests__/referralNudge.test.ts` (check `apps/serverProbe` for its test runner first: `grep -n '"test"' apps/serverProbe/package.json`; if there is none, put the pure message-building function in `libraries/core/src/referral.ts` and test it with jest there, and keep `referralNudge.ts` as thin glue)
- Modify: `apps/serverProbe/src/main.ts` (serve mode, after the control-server block and before `shutdown`, about line 205)
- Modify: `apps/serverProbe/package.json` (add `node-cron` matching the version in `libraries/scraper/package.json`)
- Modify: `libraries/scraper/src/index.ts` (export `sendPushover` and quiet-hours helpers if they are not exported yet)

**Step 1: Check what the scraper package exports**

Run: `grep -n "pushover\|quietHours\|dispatch" libraries/scraper/src/index.ts`
If `./pushover` and `./notifications/quietHours` are not exported, add `export * from './pushover';` and `export * from './notifications/quietHours';` and rebuild: `pnpm --filter @first2apply/scraper build`.

**Step 2: Write the failing test for the message builder**

Add to `libraries/core/src/referral.ts` a pure builder and test it in `libraries/core/src/__tests__/referral.test.ts`:

```ts
export function buildNudgeMessage(people: Array<{ firstName: string; company: string }>): { title: string; message: string } {
  const count = people.length;
  const names = people.slice(0, 3).map((p) => `${p.firstName} at ${p.company}`);
  const more = count > 3 ? ` and ${count - 3} more` : '';
  return {
    title: `Follow up on ${count} referral ${count === 1 ? 'request' : 'requests'}`,
    message: `Time to follow up with ${names.join(', ')}${more}.`,
  };
}
```

```ts
describe('buildNudgeMessage', () => {
  it('names up to three people and counts the rest', () => {
    const msg = buildNudgeMessage([
      { firstName: 'Avery', company: 'REI' },
      { firstName: 'Sam', company: 'Acme' },
      { firstName: 'Jo', company: 'Meta' },
      { firstName: 'Lee', company: 'Stripe' },
    ]);
    expect(msg.title).toBe('Follow up on 4 referral requests');
    expect(msg.message).toBe('Time to follow up with Avery at REI, Sam at Acme, Jo at Meta and 1 more.');
  });

  it('uses the singular for one request', () => {
    expect(buildNudgeMessage([{ firstName: 'Avery', company: 'REI' }]).title).toBe('Follow up on 1 referral request');
  });
});
```
Run: `cd libraries/core && npx jest --config ./jest.config.ts src/__tests__/referral.test.ts` Expected: FAIL before the function exists, PASS after.

**Step 3: Implement `referralNudge.ts`**

```ts
import { buildNudgeMessage, selectDueOutreach } from '@first2apply/core';
import { sendPushover } from '@first2apply/scraper';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schedule } from 'node-cron';

type Logger = { info: (m: string, meta?: Record<string, unknown>) => void; error: (m: string, meta?: Record<string, unknown>) => void };

type OutreachWithContact = {
  id: number;
  user_id: string;
  status: string;
  follow_up_at: string | null;
  last_nudged_at: string | null;
  connections: { first_name: string; company: string } | null;
};

/** Finds due follow-ups, sends one Pushover summary, and stamps last_nudged_at so each date nudges once. */
export async function runReferralNudge({
  supabase,
  logger,
  pushover,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  logger: Logger;
  pushover: { appToken: string; userKey: string };
  now?: Date;
}): Promise<{ nudged: number }> {
  const { data, error } = await supabase
    .from('referral_outreach')
    .select('id, user_id, status, follow_up_at, last_nudged_at, connections(first_name, company)')
    .eq('status', 'asked')
    .lte('follow_up_at', now.toISOString());
  if (error) throw error;

  const due = selectDueOutreach((data ?? []) as unknown as OutreachWithContact[], now);
  if (due.length === 0) return { nudged: 0 };

  const people = due.map((row) => ({
    firstName: row.connections?.first_name ?? 'a contact',
    company: row.connections?.company ?? 'their company',
  }));
  const { title, message } = buildNudgeMessage(people);
  await sendPushover({ appToken: pushover.appToken, userKey: pushover.userKey, title, message });

  const { error: stampError } = await supabase
    .from('referral_outreach')
    .update({ last_nudged_at: now.toISOString() })
    .in('id', due.map((r) => r.id));
  if (stampError) throw stampError;

  logger.info(`referral nudge sent for ${due.length} outreach rows`);
  return { nudged: due.length };
}

export function startReferralNudge(opts: {
  supabase: SupabaseClient;
  logger: Logger;
  pushover: { appToken: string; userKey: string };
  cronRule?: string;
}) {
  const task = schedule(opts.cronRule ?? process.env.F2A_REFERRAL_NUDGE_CRON ?? '0 9 * * *', () => {
    runReferralNudge(opts).catch((err) => opts.logger.error(`referral nudge failed: ${(err as Error).message}`));
  });
  return { stop: () => task.stop() };
}
```

Quiet hours: the daily 09:00 default avoids the usual overnight windows. If the user's `quiet_hours_enabled` schedule covers 09:00, reuse `fetchUserSettings` and `isInQuietHours` from the scraper package (exported in Step 1) to skip and let the next day's run pick it up. Implement that check only if `isInQuietHours`'s call shape matches what `dispatchPushoverSummary` does (see `libraries/scraper/src/notifications/dispatch.ts`); copy that call exactly rather than inventing one.

**Step 4: Register in `main.ts`**

After the control-server block and before `shutdown`:

```ts
const referralNudge = startReferralNudge({
  supabase,
  logger,
  pushover: { appToken: env.pushoverAppToken ?? '', userKey: env.pushoverUserKey ?? '' },
});
```
and call `referralNudge.stop()` inside `shutdown`. Skip registering when either Pushover value is empty (log one info line instead).

**Step 5: Typecheck and test**

Run: `pnpm typecheck && cd libraries/core && npx jest --config ./jest.config.ts`
Expected: exit 0, all core suites PASS.

**Step 6: Commit**

```bash
git add apps/serverProbe libraries
git commit -m "feat(probe): daily Pushover nudge for due referral follow-ups

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 13: Docs, scenarios, merge, and ship (STOP: confirm before pushing and deploying to the Pi)

**Files:**
- Modify: `CLAUDE.md`, `scenarios.md`, `docs/BACKLOG.md`, `.claude/skills/f2a-qa/SKILL.md`, `docs/QA.md`

**Step 1: Document**
- `CLAUDE.md`: add a short "Referral contacts" gotcha block: `company_key` rules live in two places (`libraries/core/src/companyKey.ts` and the SQL function) and must change together, verified by `node apps/backend/scripts/company-key-parity.mjs`; connections never store email; `draft-referral` sends only first name, position and company to the model; the nudge job and its cron env var `F2A_REFERRAL_NUDGE_CRON`.
- `scenarios.md`: append `## Company matching` (expected: "REI Co-op" and "REI, Inc." match, "Meta Platforms" and "Metaverse Labs" do not, empty names never match; `Regression coverage: libraries/core/src/__tests__/companyKey.test.ts and apps/backend/scripts/company-key-parity.mjs`) and `## Referral outreach follow-up` (asked rows nudge once per follow-up date, outcomes stop nudging; `Regression coverage: libraries/core/src/__tests__/referral.test.ts`).
- `docs/BACKLOG.md`: mark the "Referral and contacts surfacing" P2 as done with the date, and add backlog items for anything deferred (alias table management UI, outreach history view).
- `.claude/skills/f2a-qa/SKILL.md` and `docs/QA.md`: mention `03-referrals.spec.ts` and that the seed script now creates connections.

**Step 2: Full verification**

```bash
pnpm typecheck
(cd libraries/core && npx jest --config ./jest.config.ts)
qa/run-qa.sh all
node apps/backend/scripts/company-key-parity.mjs      # with the cloud env from Task 4
```
Expected: typecheck exit 0, jest all PASS, `RESULT: PASS (no new failures)` including the three referral specs, parity `OK`.

**Step 3: Commit, merge, and (after user confirmation) push**

```bash
git add -A docs CLAUDE.md scenarios.md .claude/skills/f2a-qa
git commit -m "docs: referral contacts gotchas, scenarios, backlog status

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git checkout master && git merge --no-ff feat/referral-contacts -m "Merge branch 'feat/referral-contacts': referral and contacts surfacing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Ask the user before `git push origin master` (the pre-push hook runs typecheck and unit QA). The push triggers the Release workflow that builds the probe image containing the nudge job.

**Step 4: Roll the Pi forward (after the user confirms)**

```bash
ssh maadkal@raspberrypi 'bash /opt/first2apply/deploy.sh'
ssh maadkal@raspberrypi 'systemctl is-active f2a-server-probe; docker logs --since 2m f2a-server-probe 2>&1 | grep -iE "referral|error" | tail -5'
```
Expected: `active`, and no `referral nudge failed` lines. The edge function and `libraries/core` were already synced in Task 10; resync them if later tasks changed those files.

**Step 5: Clean up**

```bash
git worktree remove ../first2apply-wt-referrals
git branch -d feat/referral-contacts
```

---

## Out of scope (do not build)

Web enrichment of company pages, automatic sending, scraping LinkedIn, tracking replies from LinkedIn, fuzzy or AI company matching, an alias management UI.
