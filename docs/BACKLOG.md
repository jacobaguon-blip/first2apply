# first2apply backlog

Last updated: 2026-10-08

## Feature Requests

### P0
- (none)

### P1
- (none)

### Done (P1)
- ~~Merge & ship sort+location feature~~ - merged to master 2026-06-25; cloud migration `20260528000000` applied 2026-10-07 (along with `20261007000000`, which drops the legacy `list_jobs`/`count_jobs` overloads the first one left behind). Desktop deploy of the build was not re-verified. *Resolved: 2026-10-07.*
- ~~Package & ship a new desktop release including Scan now button~~ — 2.4.0 built, staged, installed locally, and deployed to her Mac via `deploy-to-her.sh`. *Resolved: 2026-05-19.*

### P2
- **Referral and contacts surfacing.** Persist the LinkedIn connections CSV and show "you know N people at this company" on each job, with an AI-drafted referral message (copy and open-profile only, never sent automatically) and an outreach log with a follow-up nudge via Pushover. Design agreed 2026-10-08: `connections` and `referral_outreach` tables (RLS per user), `company_key` normalization mirrored in TS and SQL (same pattern as `classify_job_location`), `get_job_contacts`/`count_job_contacts` functions, `draft-referral` edge function, no email column. Supersedes the old unprioritized "LinkedIn connections CSV import" idea. Design doc: `docs/plans/2026-10-08-referral-contacts-design.md` (not written yet). *Source: session 2026-10-08.*
- **`buildOpenAiClient` supports only local Ollama and OpenAI, add a cloud provider option (Gemini first)** - `apps/backend/supabase/functions/_shared/env.ts:5` defines `AiProvider = 'openai' | 'local'` and `env.ts:35` collapses anything other than the literal `openai` into `local`, so a typo in `F2A_AI_PROVIDER` silently selects the 3B Ollama. `openAI.ts:40` branches only on `local`; the non-local path hardcodes OpenAI with `OPENAI_API_KEY` and a `COST_PER_MODEL` table that only knows `gpt-4o` and `gpt-4o-mini` (`openAI.ts:23-26`). There is no way to point the edge functions at a hosted non-OpenAI model. **Why now:** the owner expects to move off the local model. Observed pressure on 2026-10-08: custom-board parses on the Pi CPU queue for many minutes (REI link 270 still pending after 15+ minutes; `PARSE_CALL_TIMEOUT_MS = 1_680_000` at `customJobsParser.ts:205`), and the planned referral drafting (`draft-referral`) would inherit the same latency. **Verified:** Gemini documents an OpenAI-compatible endpoint, `https://generativelanguage.googleapis.com/v1beta/openai/`, usable with the OpenAI SDK by changing base URL, key and model (ai.google.dev/gemini-api/docs/openai), and documents function calling through it. **Unverified:** whether `response_format` with `zodResponseFormat` (JSON schema), used by `customJobsParser.ts:436` and others, works through that layer; model IDs, pricing and rate limits; behavior with the 16k-token prompts the parsers send. **Fix:** (1) extend `AiProvider` to `'local' | 'openai' | 'gemini'` and make `parseEnv` throw on an unknown `F2A_AI_PROVIDER` instead of defaulting; (2) add `GEMINI_API_KEY` and `F2A_GEMINI_MODEL` env vars and a `gemini` branch in `buildOpenAiClient` that builds `new OpenAI({ baseURL, apiKey })`; (3) add cost entries only after pricing is confirmed from Google's docs; (4) keep `local` the default and consider a per-function override so cheap bulk parses can stay local while drafting and evaluation use the cloud model; (5) wrap the cloud client with the same retry fetch used for local only if a connection-error pattern appears. **Privacy and policy note:** CVs, contacts-derived text and job descriptions would leave the household, which departs from CLAUDE.md quirk 8 ("no API keys"); decide that explicitly and document it. **Test gap:** no test covers provider selection or `buildOpenAiClient` at all (`_shared/localFetch.test.ts` only covers the retry wrapper). Add a Deno test that unknown provider values are rejected and that each provider yields the expected `baseURL` and model. *Source: session 2026-10-08.*

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
- **[P3]** ~~Remove dead `/connections` page or wire it up~~ - superseded by the referral feature above, which wires it up. *Source: session 2026-05-28.*
- **[P3]** Add `max-w-full` to skeleton components with fixed pixel widths (`SettingsSkeleton.tsx`, `CronScheduleSkeleton.tsx`). *Source: session 2026-05-28.*

## Bugs
- (none open)

Resolved:
- ~~**`status='deleted'` writes target a value not in the cloud `"Job Status"` enum.**~~ Fixed by migration `20260427120000_add_deleted_to_job_status.sql` (option A). The UI distinguishes Archive (visible in archived tab) from Delete (permanently dismissed); soft-delete is the right primitive because `scan-urls` upserts on `(user_id, externalId)` with `ignoreDuplicates=true`, so hard-delete would let the next scrape recreate the job.

## Ideas (unprioritized, carried over from the original backlog)

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
- **Target company page validation on add** — when a user submits a new target company URL in `CreateCompanyTarget`, validate it before saving: (1) URL must point to a careers/jobs page (heuristics: `/careers`, `/jobs`, `/careers-home`, or known ATS like Greenhouse/Lever/Workday), (2) run a real Pi-side scan immediately (via the new `/scan/link/:id` control endpoint) and confirm at least one job was extracted, (3) surface inline error to the user if validation fails (e.g. "We couldn't find any jobs on this page — is this the right URL?"). Today the create flow only does a `force` scan but doesn't surface the result; the user sees `Last checked 7 minutes ago` even when zero jobs were parsed. *Source: session 2026-05-11.*
- Validate REI Custom Job Board (Beta) parser — large HTML (373KB) yields zero jobs via GPT-4o extraction. Parser-quality issue, separate from auth fix. *Source: session 2026-05-11.*
- Fix `publish-release.sh` dmg-maker crash (`NODE_MODULE_VERSION 137 vs 141` on `macos-alias`). `pnpm rebuild macos-alias` or pin Node version. *Source: session 2026-05-11.*
- Lock Pi control endpoint port 7879 to Tailscale interface only via Pi firewall (`ufw`/iptables). Currently `--network host` exposes on all interfaces; bearer secret is the only network-layer auth. *Source: session 2026-05-11.*
- **[P2]** Generate real PWA icon set for `apps/webapp` from a brand SVG (currently reusing favicons). Use `pwa-asset-generator` in icons-only mode (do not pass `--manifest` / `--index` — those clobber hand-edited files). *Source: session 2026-05-18.*
- **[P3]** Decide on the dormant `apps/serverWebUI` scaffold — delete or claim a separate port (e.g. 3031) for a future operator UI. The `f2a-web-ui` systemd slot is now used by `apps/webapp`. *Source: session 2026-05-18.*
- **[P3]** If sharing the PWA outside the tailnet is ever wanted, enable Tailscale Funnel **or** stand up Let's Encrypt + public DNS for the Pi. Explicit one-way door — currently out of scope. *Source: session 2026-05-18.*
- **[P2]** Harden `apps/desktopProbe/scripts/deploy-local.sh` against stale `.env.deploy-local-backup` — current behavior silently restores the backup on next run, which clobbers post-crash `.env` edits. Either checksum/compare before restoring, or warn loudly and require an explicit `--restore-backup` flag. *Source: session 2026-05-28.*
- **[P2]** Add `F2A_FUNCTIONS_URL=http://raspberrypi:54321` (commented) to `apps/desktopProbe/.env.example` and `.env.pi.example` so the Pi-edge routing toggle is discoverable. Also document the matching `webpack.plugins.ts` `EnvironmentPlugin` whitelist requirement — any new `.env` var consumed by main-process code must be added there, otherwise webpack inlines `undefined` and the value is silently lost at build time. *Source: session 2026-05-28.*
- **[P3]** Push wife's machine to the same desktop build via `pnpm --filter first2apply-desktop deploy:all` after household validation — currently only this Mac has the re-apply button + Pi-routing wiring. *Source: session 2026-05-28.*
- **[P3]** Make hosted Supabase deploy work for edge functions that import `@first2apply/core` — currently the import-map alias resolves outside the upload bundle scope, so the cloud bundler fails. Options: copy/symlink `libraries/core/src/index.deno.ts` into the functions upload tree, or migrate shared modules off the `@first2apply/core` alias. Would unblock cloud fallback when the Pi is unreachable. *Source: session 2026-05-28.*

## Open follow-ups (from the 2026-10 upstream sync and Pi recovery)

- **[P2]** REI link 270 (`rei.jobs` filtered search, custom board) parse result is still pending on the 3B CPU model (page markdown is only about 6k chars, likely a JS shell). If it yields 0 jobs, add a dedicated REI parser or use a stronger model for custom boards. Also consider deleting REI link 6 (77 consecutive failures). Related to the older "Validate REI Custom Job Board" item above. *Source: session 2026-10-07.*
- **[P2]** Refresh stale parser fixtures from live pages. `parseLinkedInJobs parses v1 list markup` fails on master and upstream (expects 25, gets 50). Remote.io fixture is old markup (parser now accepts both layouts). The Dice fixture and parser fix from upstream `660f4a5` were not taken because that commit bundles the OpenRouter provider switch. *Source: upstream parser sync.*
- **[P3]** Evaluate upstream `660f4a5` pieces separately from the provider switch: the 24-hour re-scrape limit for custom boards in `scan-urls/index.ts`, and the Dice parser fix. Skip the DeepSeek/OpenRouter swap (conflicts with local AI on the Pi). *Source: upstream parser sync.*
- **[P3]** Upstream `ff1b497` (language and security settings on job functions) and `28017b1` (Electron upgrade) were not cherry-picked. Review for the next sync. Upstream remote is `beastx-ro/first2apply` (remote name `upstream`). *Source: upstream parser sync.*
- **[P3]** Add a hiring.cafe search link in the app to exercise the new parser end to end (site row id 18 exists in the cloud DB). *Source: session 2026-10-07.*
- **[P3]** Tailscale API token in Keychain (`tailscale-api`) is invalid. Needs a new token from the Tailscale admin console (cannot be created via API). Low priority now that key expiry is off. *Source: session 2026-10-07.*

## Done 2026-10-07

- Upstream parser sync (16 commits: LinkedIn, Indeed, hiring.cafe, USAJobs, Dice/FlexJobs salary, remote.io), merged and pushed. LinkedIn confirmed live (90 jobs parsed, +70 new).
- Green typecheck baseline (`pnpm typecheck` exits 0) and full pre-push typecheck restored.
- Tiered QA harness (`qa/run-qa.sh`, Playwright UI tier, hooks, `f2a-qa` skill). QA account in Keychain (`f2a-qa`), `qa/seed-qa-account.sh`, all 10 UI checks pass.
- Cloud Supabase project restored; hiring.cafe `sites` row (id 18) inserted; pending migration applied; migration `20261007000000` drops legacy `list_jobs`/`count_jobs` overloads.
- Pi: Tailscale re-authenticated with key expiry disabled, DNS pinned (immutable `/etc/resolv.conf`), probe and edge redeployed and healthy.
- Scan order: non-custom links before slow LLM-parsed custom boards (`libraries/scraper/src/scanOrder.ts`).
- Ollama cold-start: `_shared/localFetch.ts` retries connection errors for up to 90s (live-verified).

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
