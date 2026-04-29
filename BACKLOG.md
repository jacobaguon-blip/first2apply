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
- Tailscale on both Macs to make household deploys travel-proof. **Scripts done** (`deploy-to-her.sh` now reads `~/.f2a/deploy.config` with a TARGETS array, probes Tailscale-first then `.local` fallback). **Remaining manual:** install Tailscale on her Mac per `apps/desktopProbe/packagers/household/TAILSCALE_SETUP.md` (she signs in once with the same identity used on yours). After that, dry-run from any network should resolve the Tailscale hostname.

## Bugs

_None currently logged. Resolved bugs:_

- ~~**`status='deleted'` writes target a value not in the cloud `"Job Status"` enum.**~~ Fixed by migration `20260427120000_add_deleted_to_job_status.sql` (option A). The UI distinguishes Archive (visible in archived tab) from Delete (permanently dismissed); soft-delete is the right primitive because `scan-urls` upserts on `(user_id, externalId)` with `ignoreDuplicates=true`, so hard-delete would let the next scrape recreate the job.
