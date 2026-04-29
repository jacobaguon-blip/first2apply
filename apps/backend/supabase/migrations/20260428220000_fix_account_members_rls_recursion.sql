-- Fix: "members read their memberships" RLS policy self-references
-- account_members in its USING clause, causing infinite recursion when
-- the table is queried (e.g. from F2aSupabaseApi.getMasterContent →
-- supabase.from('account_members').select('account_id').eq('user_id', ...)).
--
-- Users only need to see their own membership row to resolve their
-- account_id; they do not need visibility into other members of the
-- same account for current features. Drop the recursive branch.

drop policy if exists "members read their memberships" on public.account_members;

create policy "members read their own membership"
  on public.account_members for select to authenticated
  using (user_id = auth.uid());
