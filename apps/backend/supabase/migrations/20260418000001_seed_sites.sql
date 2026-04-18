-- Seed the sites table with the 16 supported job boards (from sites_rows.csv).
-- Using ON CONFLICT DO NOTHING so re-running is safe.

insert into public.sites (id, name, urls, created_at, "queryParamsToRemove", logo_url, blacklisted_paths, provider, deprecated, incognito_support) values
  (1, 'LinkedIn', ARRAY['https://www.linkedin.com'], '2024-01-20 15:02:02.723394+00', ARRAY['currentJobId'], 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/linkedin.png', ARRAY['/', '/jobs/', '/feed/'], 'linkedin', false, true),
  (2, 'Glassdoor', ARRAY['https://www.glassdoor.com', 'https://www.glassdoor.it'], '2024-01-20 15:04:01.815691+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/glassdoor.png', ARRAY['/', '/index.htm/', '/job/index.htm/'], 'glassdoor', false, false),
  (3, 'Indeed', ARRAY['https://www.indeed.com'], '2024-01-20 15:04:34.53859+00', ARRAY['vjk'], 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/indeed.png', ARRAY['/'], 'indeed', false, false),
  (4, 'Remote OK', ARRAY['https://remoteok.com'], '2024-01-20 15:05:42.908282+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/remoteok.png', ARRAY['/'], 'remoteok', false, false),
  (5, 'We Work Remotely', ARRAY['https://weworkremotely.com'], '2024-01-20 15:06:51.637899+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/weworkremotely.png', ARRAY['/'], 'weworkremotely', false, false),
  (6, 'Dice', ARRAY['https://www.dice.com'], '2024-02-18 21:24:51.005635+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/dice.png', ARRAY['/'], 'dice', false, false),
  (7, 'Flexjobs', ARRAY['https://www.flexjobs.com'], '2024-02-19 18:47:19.776765+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/flexjobs.png', ARRAY['/'], 'flexjobs', false, false),
  (8, 'Bestjobs', ARRAY['https://www.bestjobs.eu'], '2024-02-20 20:11:05.704758+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/bestjobs.png', ARRAY['/'], 'bestjobs', true, false),
  (9, 'Echojobs', ARRAY['https://echojobs.io'], '2024-02-26 21:00:37.631948+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/echojobs.png', ARRAY['/'], 'echojobs', true, false),
  (10, 'Remotive', ARRAY['https://remotive.com'], '2024-02-29 20:19:10.0231+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/remotive.png', ARRAY[]::text[], 'remotive', false, false),
  (11, 'Remoteio', ARRAY['https://www.remote.io'], '2024-03-02 19:41:10.646411+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/remoteio.png', ARRAY['/'], 'remoteio', false, false),
  (12, 'Builtin', ARRAY['https://builtin.com/'], '2024-03-02 20:35:38.822484+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/builtin.png', ARRAY['/'], 'builtin', false, false),
  (13, 'Naukri', ARRAY['https://www.naukri.com'], '2024-03-02 22:05:48.946062+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/naukri.png', ARRAY['/'], 'naukri', true, false),
  (14, 'Robert Half', ARRAY['https://www.roberthalf.com'], '2024-03-10 15:59:51.175727+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/robert-half.png', ARRAY['/', '/us/en/'], 'robertHalf', false, false),
  (15, 'ZipRecruiter', ARRAY['https://www.ziprecruiter.com'], '2024-10-08 19:18:46.060992+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/ziprecruiter.png?t=2024-10-08T19%3A49%3A14.430Z', ARRAY['/'], 'zipRecruiter', true, false),
  (16, 'USA Jobs', ARRAY['https://www.usajobs.gov'], '2024-10-08 20:05:31.819605+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/usajobs.png', ARRAY['/'], 'usaJobs', false, false),
  (17, 'Custom Job Board (Beta)', ARRAY['https://google.com/'], '2025-08-29 10:21:22.12473+00', NULL, 'https://vnawaforiamopaudfefi.supabase.co/storage/v1/object/public/first2apply-public/custom.png', ARRAY['/'], 'custom', false, false)
on conflict (id) do nothing;

-- Keep the sequence aligned with our manually-specified ids.
select setval(
  pg_get_serial_sequence('public.sites', 'id'),
  (select coalesce(max(id), 1) from public.sites)
);
