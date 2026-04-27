-- Household self-host override: remove the 7-day trial paywall so family members
-- aren't kicked to the subscription page. Sets new signups to pro tier with a
-- far-future end date, and updates any existing profiles to match.

alter table public.profiles alter column subscription_end_date set default (now() + interval '100 years');
alter table public.profiles alter column subscription_tier set default 'pro';
alter table public.profiles alter column is_trial set default false;

update public.profiles
set
  subscription_end_date = now() + interval '100 years',
  subscription_tier = 'pro',
  is_trial = false;
