-- When a link is removed, delete its un-actioned jobs so the New Jobs list
-- doesn't keep showing orphaned rows from a source the user no longer tracks.
-- Preserve jobs the user already acted on ('applied', 'archived', 'deleted')
-- as orphans (link_id = NULL) via the existing FK ON DELETE SET NULL.

create or replace function delete_unactioned_jobs_for_link()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.jobs
  where link_id = old.id
    and status in ('new', 'processing', 'excluded_by_advanced_matching');
  return old;
end;
$$;

create trigger links_before_delete_cleanup_jobs
before delete on public.links
for each row
execute function delete_unactioned_jobs_for_link();
