-- Item 9 — Master resume + cover letter (account-level).
-- Also bootstraps the multi-account scaffolding required by spec.md §5 Item 4.
-- Scope this weekend: schema only. UI in apps/desktopProbe/src/pages/master-content.tsx.
-- Spec: spec.md §5 Item 9 + §9 Item 4 multi-account.

-- ---------- Accounts (multi-tenant scaffolding) ----------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  owner_user_id uuid not null references auth.users(id) on delete cascade
);

create table if not exists public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  added_at   timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index if not exists account_members_user_idx
  on public.account_members (user_id);

alter table public.accounts          enable row level security;
alter table public.account_members   enable row level security;

create policy "members read their accounts"
  on public.accounts for select to authenticated
  using (
    id in (select account_id from public.account_members where user_id = auth.uid())
  );

create policy "members read their memberships"
  on public.account_members for select to authenticated
  using (user_id = auth.uid()
         or account_id in (select account_id from public.account_members where user_id = auth.uid()));

-- Add nullable account_id to profiles (defaults to user's personal account on first login).
alter table public.profiles
  add column if not exists account_id uuid null references public.accounts(id) on delete set null;

-- ---------- Master content (one row per account) ----------

create table if not exists public.account_master_resume (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  content_jsonb     jsonb not null default '{}'::jsonb,
  uploaded_filename text null,
  uploaded_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.account_master_cover_letter (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  content_jsonb     jsonb not null default '{}'::jsonb,
  uploaded_filename text null,
  uploaded_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.account_master_resume       enable row level security;
alter table public.account_master_cover_letter enable row level security;

create policy "account members manage master resume"
  on public.account_master_resume for all to authenticated
  using (
    account_id in (select account_id from public.account_members where user_id = auth.uid())
  )
  with check (
    account_id in (select account_id from public.account_members where user_id = auth.uid())
  );

create policy "account members manage master cover letter"
  on public.account_master_cover_letter for all to authenticated
  using (
    account_id in (select account_id from public.account_members where user_id = auth.uid())
  )
  with check (
    account_id in (select account_id from public.account_members where user_id = auth.uid())
  );

-- ---------- First-login trigger: create personal account ----------

create or replace function public.ensure_personal_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  acct_id uuid;
begin
  if new.account_id is not null then
    return new;
  end if;
  insert into public.accounts (name, owner_user_id)
  values (coalesce((select email from auth.users where id = new.id), 'Personal'), new.id)
  returning id into acct_id;
  insert into public.account_members (account_id, user_id, role)
  values (acct_id, new.id, 'owner');
  new.account_id := acct_id;
  return new;
end;
$$;

drop trigger if exists profiles_personal_account on public.profiles;
create trigger profiles_personal_account
  before insert or update of account_id on public.profiles
  for each row when (new.account_id is null)
  execute function public.ensure_personal_account();
