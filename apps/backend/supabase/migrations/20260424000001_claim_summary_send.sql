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
