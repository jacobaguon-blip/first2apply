-- Add 'deleted' to the "Job Status" enum so soft-delete writes from the UI succeed.
--
-- Background: the desktop and webapp UIs distinguish Archive (visible in the
-- archived tab) from Delete (permanently dismissed, no tab). Four call sites
-- write status='deleted':
--   - libraries/ui/src/components/jobs/jobSummary.tsx:292
--   - apps/webapp/src/app/jobs/list/[status]/ListJobsFeed.tsx:99
--   - apps/desktopProbe/src/components/home/jobTabs.tsx:100
--   - apps/desktopProbe/src/components/home/jobTabsContent.tsx:351
-- but the enum from the initial schema (20260418000000) only includes
--   'new', 'applied', 'archived', 'processing', 'excluded_by_advanced_matching'
-- so these writes have been failing at runtime with 22P02. Soft-delete is the
-- right primitive here because scan-urls upserts on (user_id, externalId) with
-- ignoreDuplicates=true — hard-deleting a row would let the next scrape
-- recreate it as 'new', defeating the user's intent.

alter type public."Job Status" add value if not exists 'deleted';
