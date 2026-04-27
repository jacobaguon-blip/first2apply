-- Per-link scan cadence: 'hourly' (default, existing behavior) or 'daily'
-- for company career-page targets throttled to one scan per 24h.
alter table public.links
  add column scan_frequency text not null default 'hourly'
  constraint links_scan_frequency_check check (scan_frequency in ('hourly', 'daily'));
