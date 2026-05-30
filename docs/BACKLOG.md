# first2apply backlog

Last updated: 2026-05-29

## Feature Requests

### P0
- (none)

### P1
- **Merge & ship sort+location feature.** Manual-smoke `feature/sort-and-location-filter`; on green, merge to master, apply migration `20260528000000_sort_and_location.sql` to cloud Supabase, run `/deploy-desktop`. *Source: session 2026-05-28.*

### Done (P1)
- ~~Package & ship a new desktop release including Scan now button~~ — 2.4.0 built, staged, installed locally, and deployed to her Mac via `deploy-to-her.sh`. *Resolved: 2026-05-19.*

### P2
- (none)

### Done (P2)
- ~~UX: route careers-page URLs from Add Search → Add Target~~ — shipped in 2.4.1. Chooser dialog surfaces when the captured URL matches `looksLikeCareersUrl`. *Resolved: 2026-05-19.*
- ~~Resolve pre-existing `chatgpt_prompt` TS errors~~ — verified clean; references type against `AiFilterProfile` (which still has the field), not `AdvancedMatchingConfig`. Backlog item was stale. *Resolved: 2026-05-19.*

### P3
- **Posted-date sort behind feature flag.** Only enable for Indeed + LinkedIn (the boards that reliably expose posted-date). Requires `posted_date timestamptz` column on `jobs`, parser changes, and a "best effort" UI label. *Source: session 2026-05-28.*
- **Extract `buildJobsUrl(params)` helper.** `jobTabsContent.tsx` constructs the jobs URL in three callsites (`onTabChange`, `onSearchJobs`, `onSortChange`) that have already begun to drift (one has `&r=` cache-buster, only one encodes `loc_contains`, etc.). *Source: session 2026-05-28.*
- **`ProfileFieldPatch` type alias in `filters.tsx`.** Dedupe the two `Partial<Pick<AiFilterProfile, ...>>` callsites so the next field addition only edits one place. *Source: session 2026-05-28.*
- **Functional index on `classify_job_location(location)`.** Only add if bucket filtering becomes a hot path (currently a seq-eval over the user's row set, fine at present scale). *Source: session 2026-05-28.*

## QA Polish (from 2026-05-28 audit)
- **[P2]** Standardize inline error display — currently three patterns (`<Alert>`, raw `<p class="text-destructive">`, toast). Pick one for inline form errors. *Source: session 2026-05-28.*
- **[P2]** Add required field indicators (asterisks) to all forms with Zod required fields. *Source: session 2026-05-28.*
- **[P2]** Render `<FormMessage>` in desktop app forms so Zod validation errors are visible inline (currently errors are computed but never displayed). *Source: session 2026-05-28.*
- **[P3]** Add character counters to filters page inputs (name maxLength=80, prompt maxLength=5000, blacklist maxLength=100). *Source: session 2026-05-28.*
- **[P3]** Remove dead `/connections` page (`pages/connections.tsx`) or wire it up as a route in `app.tsx`. *Source: session 2026-05-28.*
- **[P3]** Add `max-w-full` to skeleton components with fixed pixel widths (`SettingsSkeleton.tsx`, `CronScheduleSkeleton.tsx`). *Source: session 2026-05-28.*

## Bugs
- (none open)

## Career Ops roadmap (post-Tier 1)

Spec: `docs/superpowers/specs/2026-05-19-career-ops-design.md`. Tier 1 (master CV + tailored CV + PDF export) is shipped to dev behind `career_ops_enabled`. Everything below is queued.

### Tier 2 — filter the inbox into a ranked shortlist

- **#4 A–F score + 6-block evaluation.** Edge function `evaluate-job` (master CV + JD → `{ score 0–100, grade A–F, blocks: { role_summary, cv_match, level_strategy, comp_research, personalization, interview_prep } }`). New `evaluations` row keyed by `job_id`. Jobs list gets a sortable **Fit** column. Job detail gets a collapsible 6-block panel.
- **#5 Role archetype tag.** Bundle with #4 — single extra LLM output. Adds `archetype` column to `evaluations` and a filter chip row in the jobs list (LLMOps / Agentic / PM / SA / FullStack / Transformation / Other).

### Tier 3 — once interviews land

- **#6 Interview story bank (STAR + Reflection).** New page Profile → "My Stories". `user_stories(id, user_id, title, situation, task, action, result, reflection, tags[])`. On job detail, model picks the 3 most relevant stories per JD and surfaces them in an "Interview Prep" tab.
- **#7 Deep company research brief.** Button on job detail: *Research Company*. New edge function `research-company` web-fetches careers + a LinkedIn-style summary, stores on `evaluations.company_brief`. Cached per company so re-running for another role is instant.

### Tier 3.5 — close the loop on applications

- **Auto-apply after resume approval.** Once the user reviews and approves a tailored CV for a job, kick off an automated submission to that job's portal (Greenhouse / Ashby / Lever / custom). Approval is the gating event — no autopilot without an explicit human sign-off per job. Reverses the Tier 1 non-goal of "no auto-submission," so needs a dedicated spec covering: portal coverage, credential storage, cover-letter generation, anti-bot risk, and an audit log of every submitted application. Likely a separate quarter.

### Tier 4 — offer / cold-reach stage

- **#8 Negotiation script.** Button surfaces when job status moves to "offer". Generates a per-job script from JD comp signals + user profile.
- **#9 LinkedIn outreach draft.** Button: *Draft outreach*. Short cold message to a recruiter/hiring manager, copy-to-clipboard only — no automation.

### Deferred (Phase 3 — do not build now)

- Training / certification gap analysis — nice-to-have, doesn't block applications.
- Portfolio project scoring — only useful once a project store exists.
- Direct Greenhouse / Ashby / Lever API integration — touches the live scraper, high regression risk for low marginal gain.
- Application-form fill — large browser-automation surface, separate spec, separate quarter.

### Build order at a glance

| Wk | Ship to dev | Capability unlocked |
|---|---|---|
| 1 | Master CV (#1) | Store the master resume |
| 1 | Tailored CV + PDF (#2, #3) | Tailored resume per job |
| 2 | Evaluate + score (#4) | Rank the job list |
| 2 | Archetype tag (#5) | Filter by role type |
| 3 | Story bank (#6) | Interview prep |
| 3 | Company brief (#7) | Pre-interview research |
| 4+ | Negotiation (#8), Outreach (#9) | Offer + cold-reach |

### Data model summary (single migration for the rest)

```
user_cv_profiles(user_id PK, markdown, updated_at)               -- shipped
evaluations(id, job_id FK, user_id, score, grade, archetype,     -- shipped (cols nullable for Tier 1)
            blocks jsonb, tailored_cv, company_brief, created_at)
user_stories(id, user_id, title, situation, task, action,        -- Tier 3
             result, reflection, tags[])
```

Flag: `career_ops_enabled boolean` on `user_profiles`, default false. All new UI hidden when false; all new edge functions return 403 when false. Toggle via Settings → "Experimental features" in dev builds only.
