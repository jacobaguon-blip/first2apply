-- 20261007000000_drop_legacy_job_function_overloads.sql
--
-- 20260528000000_sort_and_location.sql used `create or replace function` with
-- extra parameters. Postgres treats a different parameter list as a new
-- overload, so the pre-sort/location versions of list_jobs and count_jobs kept
-- existing next to the new ones. Because every new parameter has a default,
-- PostgREST cannot choose between the two and fails with
-- "Could not choose the best candidate function". The new signatures accept all
-- of the old named arguments, so the legacy overloads are safe to drop.

drop function if exists public.list_jobs(
  "Job Status", text, integer, text, integer[], integer[], text[]
);

drop function if exists public.count_jobs(
  "Job Status", text, integer[], integer[], text[]
);
