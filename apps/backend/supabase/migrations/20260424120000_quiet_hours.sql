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
