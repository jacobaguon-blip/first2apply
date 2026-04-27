-- Enforce that links.filter_profile_id, when set, references a profile owned by
-- the same user as the link. The FK alone allows cross-user assignment because
-- it only validates that the profile id exists.

create or replace function public.assert_link_filter_profile_owner()
returns trigger
language plpgsql
as $$
declare
  v_profile_user uuid;
begin
  if new.filter_profile_id is null then
    return new;
  end if;

  select user_id into v_profile_user
    from public.ai_filter_profiles
    where id = new.filter_profile_id;

  if v_profile_user is null then
    raise exception 'filter_profile_id % does not exist', new.filter_profile_id;
  end if;

  if v_profile_user <> new.user_id then
    raise exception 'filter_profile_id % belongs to a different user', new.filter_profile_id
      using errcode = '42501'; -- insufficient_privilege
  end if;

  return new;
end;
$$;

drop trigger if exists links_filter_profile_owner_check on public.links;
create trigger links_filter_profile_owner_check
  before insert or update of filter_profile_id, user_id on public.links
  for each row execute function public.assert_link_filter_profile_owner();
