-- Fix: ensure_personal_account used `new.id` (profiles bigint PK) where it
-- meant `new.user_id` (uuid FK to auth.users). This caused
-- "database error saving new user" on signup because the type mismatch
-- aborts the auth.users insert via the chained trigger:
--   on_auth_user_created -> handle_new_user -> insert profiles ->
--     profiles_personal_account -> ensure_personal_account() -> ERROR.

create or replace function public.ensure_personal_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  acct_id uuid;
begin
  if new.account_id is not null then
    return new;
  end if;
  insert into public.accounts (name, owner_user_id)
  values (
    coalesce((select email from auth.users where id = new.user_id), 'Personal'),
    new.user_id
  )
  returning id into acct_id;
  insert into public.account_members (account_id, user_id, role)
  values (acct_id, new.user_id, 'owner');
  new.account_id := acct_id;
  return new;
end;
$$;
