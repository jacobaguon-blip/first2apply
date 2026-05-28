-- 20260528000000_sort_and_location.sql

-- 1. AI Filter Profile location preferences
alter table public.ai_filter_profiles
  add column if not exists location_buckets  text[] null,
  add column if not exists location_contains text[] null;

-- 2. SQL classifier mirroring libraries/core/src/classifyLocation.ts.
--    Word-boundary regex via \m \M anchors. See the TS file's JSDoc for the
--    accepted-false-positive contract — do NOT add lookbehind to "fix" prose
--    like "Remote office in NYC".
create or replace function public.classify_job_location(loc text)
returns text language sql immutable as $$
  select case
    when loc is null or btrim(loc) = '' then 'unspecified'
    when loc ~* '\mremote\M' then 'remote'
    when loc ~* '\mhybrid\M' then 'hybrid'
    else 'onsite'
  end;
$$;

-- CALLER CONTRACT: the keyset cursor (jobs_after = "id!updated_at") is
-- direction-sensitive. When the caller toggles jobs_sort between
-- 'newest_first' and 'oldest_first', it MUST pass jobs_after = null on the
-- first request after the toggle. Reusing a stale cursor will silently skip
-- or duplicate jobs at the boundary.

-- 3. list_jobs: add sort + location params. Cursor format unchanged (id!updated_at).
--    For oldest_first we paginate ascending and flip the cursor comparison.
create or replace function list_jobs(
    jobs_status "Job Status",
    jobs_after text,
    jobs_page_size integer,
    jobs_search text default null,
    jobs_site_ids integer[] default null,
    jobs_link_ids integer[] default null,
    jobs_labels text[] default null,
    jobs_sort text default 'newest_first',
    jobs_location_buckets text[] default null,
    jobs_location_contains text default null
)
returns setof jobs as $$
declare
  after_id integer;
  after_updated_at timestamp;
  ascending boolean := (jobs_sort = 'oldest_first');
begin
  if jobs_after is not null then
    after_id := split_part(jobs_after, '!', 1)::integer;
    after_updated_at := split_part(jobs_after, '!', 2)::timestamp;
  end if;

  return query
  select *
  from jobs
  where user_id = auth.uid()
    and status = jobs_status
    and (
      jobs_after is null or (
        case
          when ascending then (updated_at, id) > (after_updated_at, after_id)
          else                (updated_at, id) < (after_updated_at, after_id)
        end
      )
    )
    and (array_length(jobs_site_ids, 1) is null or "siteId" = any(jobs_site_ids))
    and (array_length(jobs_link_ids, 1) is null or link_id = any(jobs_link_ids))
    and (array_length(jobs_labels, 1) is null or labels && jobs_labels)
    and (jobs_search is null or job_search_vector @@ plainto_tsquery('english', jobs_search))
    and (
      array_length(jobs_location_buckets, 1) is null
      or public.classify_job_location(location) = any(jobs_location_buckets)
    )
    and (
      jobs_location_contains is null
      or btrim(jobs_location_contains) = ''
      or location ilike '%' || jobs_location_contains || '%'
    )
  order by
    case when ascending then updated_at end asc nulls last,
    case when ascending then id end asc,
    case when not ascending then updated_at end desc nulls last,
    case when not ascending then id end desc
  limit jobs_page_size;
end; $$
language plpgsql;

-- 4. count_jobs: same location filters (sort irrelevant for counts).
--    Preserve the existing body shape from migration 20260418000000_initial_schema.sql
--    — only the signature and WHERE additions change.
create or replace function count_jobs(
    jobs_status "Job Status" default null,
    jobs_search text default null,
    jobs_site_ids integer[] default null,
    jobs_link_ids integer[] default null,
    jobs_labels text[] default null,
    jobs_location_buckets text[] default null,
    jobs_location_contains text default null
)
returns table(status "Job Status", job_count bigint) as $$
begin
  return query
  select j.status, count(*) as job_count
  from jobs j
  where j.user_id = auth.uid()
    and (jobs_status is null or j.status = jobs_status)
    and (array_length(jobs_site_ids, 1) is null or j."siteId" = any(jobs_site_ids))
    and (array_length(jobs_link_ids, 1) is null or j.link_id = any(jobs_link_ids))
    and (array_length(jobs_labels, 1) is null or j.labels && jobs_labels)
    and (jobs_search is null or j.job_search_vector @@ plainto_tsquery('english', jobs_search))
    and (
      array_length(jobs_location_buckets, 1) is null
      or public.classify_job_location(j.location) = any(jobs_location_buckets)
    )
    and (
      jobs_location_contains is null
      or btrim(jobs_location_contains) = ''
      or j.location ilike '%' || jobs_location_contains || '%'
    )
  group by j.status;
end; $$
language plpgsql;
