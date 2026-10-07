# 2026-10-07: Upstream parser sync and QA harness

Outcome: 16 upstream parser commits merged to local master, tiered QA harness (Playwright UI tier, hooks, skill) merged, full QA run green. Nothing pushed.

## Original Issue
- Review webbrain-one/webbrain for integration ideas, then check upstream (beastx-ro/first2apply) for features, cherry-pick parser fixes, QA, merge, and build reusable QA tooling.

## Follow-up Issues
- Which upstream commits to take vs skip (OpenRouter provider switch conflicts with local AI on the Pi).
- Whether a Playwright setup exists (it did not).

## Completed Tasks
- [x] Reviewed WebBrain from README and file tree; mapped use cases (auto-apply assist best fit, GPL-3.0 vs MIT caveat).
- [x] Verified repo clean and synced with origin (0 ahead, 0 behind at the time).
- [x] Added `upstream` remote (beastx-ro/first2apply, first guess of URL was wrong and corrected), found 37 new upstream commits.
- [x] Cherry-picked 16 parser commits on a worktree branch, resolved LinkedIn v6 conflict, dropped seed.sql-only `ddafd1f`.
- [x] Fixed Remote.io parser to accept flat and nested card layouts (fixture vs live markup mismatch).
- [x] Ran parser tests, desktop vitest, backend typecheck against master baseline.
- [x] Merged parser branch (2d5e431) into master.
- [x] Built QA harness via subagent (qa/run-qa.sh, Playwright via CDP filter proxy, known-failures baseline, hooks, f2a-qa skill, docs/QA.md) and merged it (cc53319).
- [x] Fixed stale-library builds in the QA runner and Prettier on create-link; full QA run passes (3 UI specs pass, 7 skip).
- [x] Logged follow-ups in BACKLOG.md; removed merged worktrees and branches.

## Skills Used
- `/summary` (this document)

## Key Findings
- LinkedIn v1 parser test fails on old master and on upstream (stale fixture, expects 25 gets 50).
- `_electron.launch` hangs on the app's hidden helper pages; a CDP filter proxy works around it.
- `libraries/*/build` going stale hid real desktop type and packaging errors.
- hiring.cafe `sites` row is only in `sites_rows.csv`, not a migration, so it is not live.
- Pre-push previously ran nx typecheck, which already fails on master; replaced with `qa:fast` + `qa:unit`.

## Current State
- master is 26+ commits ahead of origin, not pushed.
- Authenticated UI specs have never run (no credentials).

## Next Steps
- [→ P2] Run authenticated UI specs once with F2A_QA_EMAIL / F2A_QA_PASSWORD and a real .env build.
- [→ P2] Insert hiring.cafe `sites` row in cloud Supabase and redeploy Pi edge runtime.
- [→ P3] Fix the 3 backend typecheck baseline errors and the blog contentlayer typecheck, then restore full nx typecheck in pre-push.
- [ ] Decide whether to push master.

## Session Stats
- Turns: about 9. Tokens: roughly 250k estimated (plus about 183k in a Sonnet subagent). Cost: roughly $2 to $4 estimated, Sonnet pricing.
