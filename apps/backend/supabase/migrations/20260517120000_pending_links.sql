-- iOS Share-Sheet queue: rows inserted by the queue-pending-link edge function
-- and drained by the desktop app's scan loop.

create table if not exists public.pending_links (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  title         text,
  status        text not null default 'pending'
                check (status in ('pending', 'claimed', 'failed')),
  attempts      int  not null default 0,
  error_message text,
  source        text not null default 'ios-share',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pending_links_user_status_idx
  on public.pending_links (user_id, status, created_at);

alter table public.pending_links enable row level security;

create policy "users read own pending_links"
  on public.pending_links for select
  using (auth.uid() = user_id);

create policy "users insert own pending_links"
  on public.pending_links for insert
  with check (auth.uid() = user_id);

create policy "users update own pending_links"
  on public.pending_links for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own pending_links"
  on public.pending_links for delete
  using (auth.uid() = user_id);
