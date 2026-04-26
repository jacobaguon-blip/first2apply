-- Item 11 — approval flow.
-- Spec: spec.md §5 Item 11 + §9.2.

-- approval_tokens: jti replay-prevention table.
create table if not exists public.approval_tokens (
  jti          uuid primary key,
  job_id       text not null,
  consumed_at  timestamptz null,
  expires_at   timestamptz not null
);

create index if not exists approval_tokens_expires_idx
  on public.approval_tokens (expires_at);

-- jobs.approval_state: pending → approved → submitted (or rejected).
-- Add column without assuming a `jobs` table exists upstream.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='jobs') then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='jobs' and column_name='approval_state'
    ) then
      alter table public.jobs
        add column approval_state text not null default 'none'
          check (approval_state in ('none','pending_approval','approved','submitted','rejected'));
    end if;
  end if;
end$$;

alter table public.approval_tokens enable row level security;
-- service-role-only writes; no policy added for authenticated -> writes blocked by default.
create policy "service reads its own approval tokens (placeholder)"
  on public.approval_tokens for select to service_role using (true);
