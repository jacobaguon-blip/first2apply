-- Career Ops Tier 1 — master CV profile + tailored CV per job (behind feature flag).
-- Scope: Tier 1 only. The evaluations table is created with the full Tier 2 schema so
-- a future migration doesn't have to re-shape it, but Tier 1 only populates
-- tailored_cv / tailored_cv_generated_at; all other columns are nullable for now.

-- 1. Feature flag column on the existing profiles table.
alter table public.profiles
  add column if not exists career_ops_enabled boolean not null default false;

-- Make sure authenticated users can read their own profile flag through the existing select policy.
-- (profiles already has "enable select profiles for authenticated users only" on auth.uid() = user_id.)
-- Add an update policy so the renderer can toggle the flag via Supabase JS.
drop policy if exists "profiles owner can update career_ops" on public.profiles;
create policy "profiles owner can update career_ops"
on public.profiles
as permissive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2. Master CV profile — one row per user.
create table if not exists public.user_cv_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  markdown text not null,
  source_filename text,
  updated_at timestamptz not null default now()
);

alter table public.user_cv_profiles enable row level security;

drop policy if exists "user_cv_profiles owner all" on public.user_cv_profiles;
create policy "user_cv_profiles owner all"
on public.user_cv_profiles
as permissive
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 3. Evaluations — Tier 2 shape, Tier 1 only writes tailored_cv columns.
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score smallint null check (score is null or (score between 0 and 100)),
  grade text null check (grade is null or grade in ('A','B','C','D','F')),
  archetype text null,
  blocks jsonb null,
  tailored_cv text null,
  tailored_cv_generated_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

create index if not exists evaluations_user_grade_idx on public.evaluations (user_id, grade);

alter table public.evaluations enable row level security;

drop policy if exists "evaluations owner all" on public.evaluations;
create policy "evaluations owner all"
on public.evaluations
as permissive
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
