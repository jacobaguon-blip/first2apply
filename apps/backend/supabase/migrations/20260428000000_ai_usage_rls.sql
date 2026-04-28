-- Enable RLS on ai_usage_daily so users can only read their own usage rows.
-- Writes are performed by edge functions via log_ai_usage() using the service
-- role key, which bypasses RLS — so no client-side write policy is needed.

alter table public.ai_usage_daily enable row level security;

create policy "ai_usage_daily_self_select"
  on public.ai_usage_daily
  as permissive
  for select
  to authenticated
  using (auth.uid() = user_id);
