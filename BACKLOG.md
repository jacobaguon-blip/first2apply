# Backlog

- Explicit Save button on AI filter profile prompt (apps/desktopProbe/src/pages/filters.tsx) — currently the prompt textarea auto-saves on blur, which is invisible. Add a `Save` button at the bottom of the editor so the commit is explicit; same pattern for the name field. Small UX fix, ~30 min.
- Quiet hours: queue messages/notifications during configured hours and deliver them when the user is back.
- Review Pushover notification functions and message format (audit call sites, payload shape, title/body conventions, action URLs, rate limits).
- Rebuild first2apply as a server version — headless probe that runs 24/7 (e.g. on a Raspberry Pi), writes to Supabase, and drives account-level notifications (Pushover) independently of any desktop client.
- Keyword scraping from company mission statement — extract signal keywords from the employer's mission/about copy to feed resume + cover-letter tailoring.
- Keyword scraping from job description — extract required skills, tools, and role keywords from the JD for matching and tailoring.
- Per-profile resume builder — generate a tailored resume for each job from a profile-scoped master resume, guided by scraped JD + mission keywords.
- Per-profile cover letter builder — generate a tailored cover letter from a profile-scoped master resume and master cover letter, guided by scraped JD + mission keywords.
- Global master resume + master cover letter — account-level defaults used when a profile has no overrides, feeding into the per-profile builders.
- Auto-apply via Playwright Chrome extension — drive job applications through a Playwright-backed Chrome extension (form fill, upload tailored resume/cover letter, submit).
- Approve job applications via Pushover — before auto-submit, send a Pushover notification with the tailored resume/cover letter + JD summary; submission only proceeds on user approval.
- LinkedIn connections CSV import — upload the user's exported LinkedIn connections CSV, parse contacts (name, relationship, company, position), then enrich each row by resolving the company's LinkedIn page and official company website for outreach/networking workflows.

## Bugs

- **`status='deleted'` writes target a value not in the cloud `"Job Status"` enum.** Three call sites (`apps/webapp/src/app/jobs/list/[status]/ListJobsFeed.tsx:99`, `apps/desktopProbe/src/components/home/jobTabs.tsx:100`, `jobTabsContent.tsx:351`) write `status='deleted'`. The cloud enum (`apps/backend/supabase/migrations/20260418000000_initial_schema.sql:33`) only has `new|applied|archived|processing|excluded_by_advanced_matching`. The hand-rolled `DbSchema` hid this because its `JobStatus` type included `'deleted'`. At runtime the UPDATE either errors with `22P02 invalid input value for enum` or is silently rejected. Discovered 2026-04-27 while auditing the parked `DbSchema → Database` migration. Resolution options: (A) add the enum value via `ALTER TYPE`, (B) refactor sites to use `'archived'`, (C) hard-delete the row instead. Choice depends on the intended UX distinction between "deleted" and "archived" tabs.
