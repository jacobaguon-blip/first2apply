-- Long-lived personal tokens (never expire until revoked).
-- Stored as sha256(token); raw token is shown to the user exactly once at creation.

create table if not exists public.user_api_tokens (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  label        text not null,
  token_hash   text not null unique,
  scopes       text[] not null default array['queue-link']::text[],
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);

create index if not exists user_api_tokens_user_idx on public.user_api_tokens (user_id);

alter table public.user_api_tokens enable row level security;

create policy "users read own tokens"
  on public.user_api_tokens for select using (auth.uid() = user_id);

create policy "users insert own tokens"
  on public.user_api_tokens for insert with check (auth.uid() = user_id);

create policy "users revoke own tokens"
  on public.user_api_tokens for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
