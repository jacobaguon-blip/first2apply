# Career Ops Tier 1 — dev rollout

Date: 2026-05-19
Outcome: shipped Tier 1 (master CV + tailored CV + PDF export) to the dev build behind `career_ops_enabled`, deployed migration + edge functions to hosted Supabase, verified end-to-end with a real resume.

## Original Issue
Asked which `santifer/career-ops` features could be ported, then escalated to "build Tier 1 behind a feature flag and test end-to-end."

## Follow-up Issues
- Renderer was running the installed app, not the dev build (stale UI).
- App was pointed at hosted Supabase, not local — needed migration + functions deployed to remote.
- Feature flag toggle bound to env override instead of DB value.
- Transient `ENOTFOUND` on the hosted Supabase host (Tailscale DNS blip).
- User asked PDF to auto-open and a diff view to be added.
- User asked to record the roadmap in two trackers and add an "auto-apply after approval" item.

## Completed Tasks
- Wrote design spec at `docs/superpowers/specs/2026-05-19-career-ops-design.md`.
- Built Tier 1 behind `career_ops_enabled`: migration `20260519010000_career_ops_tier1.sql`, edge functions `parse-cv` + `tailor-cv`, shared prompts, IPC handlers, My CV page, Settings toggle, Tailored CV panel on job detail, PDF export via hidden BrowserWindow.
- Pushed migration + deployed both edge functions to hosted Supabase.
- Patched `useCareerOps` so the toggle reflects the true persisted DB value, not the env override.
- Added auto-open of saved PDF via `shell.openPath`.
- Added Diff view (LCS-based line diff with +/− counts) alongside Preview/Edit.
- Recorded roadmap in `docs/BACKLOG.md` and on `agile.maadcloud.com` (epic #32, stories #183–#194).

## Skills Used
- `/brainstorming`
- `/summary`

## Tools & Commands Used
- `Agent` (general-purpose) for the Tier 1 build.
- `Bash` for git, typecheck, supabase CLI, agile API, DNS.
- `Read` / `Edit` / `Write` for spec, hook, settings, jobDetails, BACKLOG.
- Notion MCP for the gap analysis page.
- `WebFetch` for the career-ops repo feature inventory.

## Key Findings
- Repo already has OpenAI plumbing and a clean edge function template — reused both.
- `seed.sql` conflicts with migrations on `supabase start`; moved aside as a workaround.
- `profiles` is keyed by `user_id`. Existing user already had a row, so plain `update` worked.
- `pdf-parse` under Deno held up for the test resume.
- `F2A_FORCE_CAREER_OPS=1` must not mask the persisted toggle state in Settings.

## Current State
- Tier 1 fully working in the dev build pointed at hosted Supabase.
- Nothing committed; nothing released to the installed `/Applications/First 2 Apply.app`.
- Tier 2–4 and deferred items live in `BACKLOG.md` + agile board only.

## Next Steps
- [→ P2] Revert or keep the scope-creep change to `linksList.tsx` / `links.tsx` (list/card view toggle).
- [→ P1] Commit the Tier 1 work to a feature branch.
- [→ P2] Regenerate `libraries/core/src/database.types.ts` to drop the `as never` casts.
- [→ P1] Start Tier 2 (agile story #184 — A–F fit score + 6-block evaluation).
- [→ P2] Write a dedicated spec for auto-apply (agile story #194) before any build.

## Session Stats
- Turns: ~50
- Tokens: ~280k estimated
- Cost: ~$10 (Opus, rough)
