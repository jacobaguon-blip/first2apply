-- Keep successful shares visible as a recent-activity log instead of deleting them.

alter table public.pending_links
  drop constraint if exists pending_links_status_check;

alter table public.pending_links
  add constraint pending_links_status_check
  check (status in ('pending', 'claimed', 'failed', 'completed'));

alter table public.pending_links
  add column if not exists completed_at timestamptz;

alter table public.pending_links
  add column if not exists link_id bigint references public.links(id) on delete set null;

create index if not exists pending_links_user_completed_idx
  on public.pending_links (user_id, status, completed_at desc);
