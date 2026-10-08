# Referral and contacts surfacing: design

Date: 2026-10-08. Status: approved in conversation, implementation plan next.

## Goal

Persist the user's LinkedIn connections and show "you know N people at this company" on each job. Let the user draft a referral message with AI (copy and open-profile only, never sent automatically), log the outreach, and get a Pushover nudge when a follow-up is due.

## Decisions

- **Scope:** name match on company, plus outreach drafting and an outreach log with follow-up nudge. No web enrichment, no fuzzy or AI company matching.
- **Storage:** cloud Supabase, private per user (row-level security), like `user_cv_profiles`. The email column from the LinkedIn export is not stored.
- **Matching:** in the database through a normalized `company_key`, so the desktop badge, the drafting function and the Pi nudge share one answer.
- **After the draft:** show it, copy it, open the contact's profile. Nothing is sent for the user.
- **Model:** drafting goes through the shared client, so it works with local Ollama or a future cloud provider (see the "cloud AI provider" backlog item). When a cloud model is used, send only first name, position and company for the contact, never profile URLs.

## Data model (one migration)

- `public.company_key(text)`: lowercase, strip punctuation and legal suffixes (inc, llc, ltd, co, corp, gmbh, ...) and filler words. "REI Co-op" and "REI, Inc." both give `rei`. A TypeScript twin lives in `libraries/core/src/companyKey.ts`. A shared fixture of input and expected pairs runs against both copies, mirroring how `classify_job_location` is kept in sync.
- `company_aliases(alias_key, canonical_key)`: empty at first, handles names normalization cannot (for example facebook to meta).
- `connections`: id, user_id, first_name, last_name, linkedin_url, company, company_key, position, connected_on. Unique on (user_id, linkedin_url). Index on (user_id, company_key). Row-level security: owner only. Re-import upserts and never deletes.
- `jobs.company_key`: generated column with an index. Existing rows are filled by the migration. No scanner change.
- `referral_outreach`: id, user_id, job_id, connection_id, status, draft, asked_at, follow_up_at, last_nudged_at, notes, created_at. Status is one of drafted, asked, replied, referred, no_reply, declined. Unique on (user_id, job_id, connection_id). Owner-only row-level security. Follow-up defaults to 7 days after asked_at and is editable.
- `get_job_contacts(job_id)` returns the contacts at that job's company with any outreach row. `count_job_contacts(job_ids[])` returns counts for the job list in one call.

## Edge function: `draft-referral`

- Input `{ job_id, connection_id }`. Same auth and `career_ops_enabled` checks as `tailor-cv`. Verifies the job and contact belong to the user and share a `company_key`.
- Reads the job title, company and description, the master CV (or the tailored CV for that job), and the contact's first name, position and time since connection.
- Prompt lives in `_shared/careerOpsPrompts.ts`: under 120 words, warm and specific, asks for a referral or conversation, cites one real CV strength, never invents facts, message text only, no links.
- Saves the text to `referral_outreach.draft` with status `drafted` and returns the row. Logs usage through `logAiUsage`.
- Registered in `_localServer.ts` next to `tailor-cv`. Errors: `no_master_cv` as in `tailor-cv`; a model failure keeps any existing draft and the UI offers Retry.

## Desktop

- **Connections page:** keep the existing parser, add Save (upsert), show "N contacts across M companies, X new, Y updated", add it to the navbar.
- **Job card:** a "2 contacts" badge from `count_job_contacts`, shown only when there is a match. Works without career ops.
- **Job detail:** a "People you know here" panel (name, position, how long connected). Per contact: Draft message, an editable draft box with Copy and Open LinkedIn profile, and a status picker. Marking asked sets `asked_at` and `follow_up_at`. The panel requires `career_ops_enabled`.
- **States:** no contacts imported shows a prompt linking to the connections page; no match shows nothing; a failed draft shows the error with Retry and keeps the old draft.

## Pi follow-up nudge

A daily job in the server probe finds `referral_outreach` rows with status `asked` and `follow_up_at` in the past and `last_nudged_at` empty or stale, sends one Pushover message per user ("Follow up with 2 people about referrals"), and sets `last_nudged_at`. It reuses the existing Pushover code and quiet hours.

## Testing

- Company key: shared fixture run against TypeScript and SQL, including must-not-match cases; alias tests.
- CSV import: existing parser tests plus re-import behavior (no duplicates, updated position).
- `draft-referral`: Deno test with a fake client for wrong company, no master CV, success, and model failure that keeps the old draft.
- Row-level security: one user cannot read or write another user's `connections` or `referral_outreach`.
- Pi nudge: due-row selection with a fake clock and the `last_nudged_at` guard.
- UI: extend `qa/seed-qa-account.sh` with contacts at "QA Co A" and add Playwright specs for the badge, panel, status picker and buttons. Drafting is covered at the function level.

## Rollout order (each step ships alone)

1. Migration to cloud (`supabase db push`, then `migration list`).
2. `libraries/core` company key and fixtures.
3. Connections page Save plus the job badge (no AI).
4. `draft-referral`, the panel controls, then rsync and restart the Pi edge runtime.
5. Pi follow-up nudge via the Release workflow and `deploy.sh`.

## Out of scope

Web enrichment of company pages, automatic sending, scraping LinkedIn, tracking replies from LinkedIn, fuzzy or AI company matching.
