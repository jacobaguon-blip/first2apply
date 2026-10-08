-- 20261008000000_referral_contacts.sql
--
-- Referral and contacts surfacing. See docs/plans/2026-10-08-referral-contacts-design.md
-- The company_key rules MUST stay identical to libraries/core/src/companyKey.ts.
-- Shared fixtures: libraries/core/src/__fixtures__/companyKey.fixtures.json,
-- checked against this function by apps/backend/scripts/company-key-parity.mjs.
--
-- WARNING: jobs.company_key and connections.company_key are STORED generated columns.
-- Changing the rules of company_key later (create or replace) does NOT recompute
-- existing rows. A rules change needs a migration that drops and re-adds both generated
-- columns (or backfills through a trigger), plus the same change in companyKey.ts and
-- the fixtures. The function is labeled immutable only because it is a pure function of
-- its input for ASCII text; never edit it in place without that rewrite.

-- 1. company_key: lowercase, & -> and, punctuation -> space, drop co-op tokens,
--    drop a leading "the", then drop trailing legal suffixes (never the last token).
--    Non a-z0-9 characters (accents, non-latin) become spaces, same as the TS twin.
create or replace function public.company_key(name text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  raw text[];
  tokens text[] := '{}';
  i integer := 1;
  suffixes text[] := array[
    'inc', 'incorporated', 'llc', 'ltd', 'limited', 'co', 'corp', 'corporation',
    'company', 'gmbh', 'plc', 'lp', 'llp', 'sa', 'ag', 'bv', 'pty', 'pllc'
  ];
begin
  if name is null then
    return '';
  end if;
  s := replace(lower(name), '&', ' and ');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  raw := array_remove(regexp_split_to_array(btrim(s), '\s+'), '');
  -- Drop co-op words on whole tokens (not regex word boundaries, which differ between
  -- Postgres and JavaScript for non-ASCII text): "co" "op", "coop", "cooperative".
  while i <= coalesce(array_length(raw, 1), 0) loop
    if raw[i] = 'co' and i < array_length(raw, 1) and raw[i + 1] = 'op' then
      i := i + 2;
    elsif raw[i] in ('coop', 'cooperative') then
      i := i + 1;
    else
      tokens := tokens || raw[i];
      i := i + 1;
    end if;
  end loop;
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
  and exists (
    select 1 from public.connections c
    where c.id = referral_outreach.connection_id and c.user_id = auth.uid()
  )
  and exists (
    select 1 from public.jobs j
    where j.id = referral_outreach.job_id and j.user_id = auth.uid()
  )
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

-- Returns no row for jobs with zero contacts: callers must default those to 0.
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
