# 2026-05-18 — Target Company Pages fix + Scan now button

## Original Issue
User-added "Anthropic" entry appeared in *Job Searches* instead of *Target Company Pages*; the Target section showed its empty-state copy.

## Follow-up Issues
- User requested a one-click "Scan now" button after the original bug was resolved.

## Completed Tasks
- [x] Used systematic-debugging Phase 1 to confirm UI partitions by `scan_frequency === 'daily'` and traced full chain client → edge fn → DB.
- [x] Confirmed via cloud SQL editor: `column "scan_frequency" does not exist` → migration not applied; edge function stale.
- [x] Installed Supabase CLI via Homebrew (`supabase/tap/supabase` 2.90.0).
- [x] Linked CLI to cloud project `rtsjqwasyzbverpkgaqm`.
- [x] `supabase db push` applied migration `20260419000000_links_scan_frequency.sql`.
- [x] `supabase functions deploy create-link` (Docker required for monorepo import resolution).
- [x] Repaired row via `supabase db query --linked`: Anthropic id=5 → `scan_frequency='daily'`.
- [x] Added `ReloadIcon` "Scan now" button in `apps/desktopProbe/src/components/linksList.tsx`; wired `handleScanLinkNow` in `apps/desktopProbe/src/pages/links.tsx` for both LinksList usages.
- [x] Typecheck clean for changed files; pre-existing `chatgpt_prompt` errors untouched.
- [x] Killed installed `/Applications/First 2 Apply.app`, started dev Electron from repo, verified scan-now triggers backend scan (`found jobs 30` in renderer console).

## Skills Used
- `systematic-debugging`
- `using-superpowers`
- `summary`

## Tools & Commands Used
- `brew install supabase/tap/supabase`
- `supabase link --project-ref rtsjqwasyzbverpkgaqm`
- `supabase db push`
- `supabase functions deploy create-link`
- `supabase db query --linked "..."`
- `npm start` (electron-forge) from `apps/desktopProbe`
- `pkill -9 -f "/Applications/First 2 Apply.app/"`

## Key Findings
- Cloud project was two deploys behind repo: missing scan_frequency migration AND old `create-link` function. Both shipped this session.
- `supabase functions deploy` fallback bundler (Docker off) mis-resolves monorepo-relative imports (`../../...` vs the actual `../../../../../libraries/core/src/index.deno.ts`). Docker-backed bundler resolves correctly.
- Repo has an auto-commit hook that produces `update: <path>` commits per file save. No manual commit needed for the new UI changes — they were already in HEAD.

## Current State
- Anthropic correctly under Target Company Pages.
- Scan now button live in dev build only; installed app still on previous bundle.
- `master` is 124 commits ahead of `origin/master` (unrelated, pre-session).
- Pre-existing TS errors in `filters.tsx` / `electronMainSdk.tsx` around `chatgpt_prompt` field. Not introduced this session.
- Dirty working tree (pre-existing): `install-on-target.sh`, `update.sh`, `kill-dev.sh`.

## Next Steps
- [→ P1] Package + deploy a new desktop release so `/Applications` build gets Scan now. [→ Backlog]
- [→ P2] Resolve pre-existing `chatgpt_prompt` TS errors (stale field vs current `AdvancedMatchingConfig`). [→ Backlog]
- [→ P2] UX: detect careers-page URLs in *Add Search* and suggest *Add Target* to prevent the same confusion. [→ Backlog]

## Session Stats
- Turns: ~30
- Tokens: ~120k (estimated)
- Estimated cost: ~$2 (Opus)
