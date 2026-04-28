# Server-probe handoff prompts

Standalone prompts for completing PRs 3-5 of the server-probe project. Each is designed to work in a **fresh `/clear`'d Claude Code session** — the agent rebuilds context from the design doc + decisions log.

## How to use

1. Open a fresh Claude Code session in `/Users/jacobaguon/projects/first2apply` (or `/clear` an existing one).
2. Copy the entire contents of the next prompt file (`PR3-prompt.md`, then `PR4-prompt.md`, then `PR5-prompt.md`).
3. Paste into Claude. The agent reads context, ships the PR, and prompts you to clear and continue.
4. Repeat for the next PR.

## Order

Strict sequential — each PR depends on the previous being merged:

```
PR3-prompt.md → PR4-prompt.md → PR5-prompt.md → manual Pi go-live
```

Each prompt's last instruction asks the agent to stop and prompt you to clear context. Don't have one session do multiple PRs — the context bloat defeats the purpose.

## What's already shipped

- **PR #17** (merged) — server-probe design + PR 1 plan
- **PR #18** (merged) — vitest setup + JobScanner regression tests
- **PR #19** (open as of 2026-04-27) — `libraries/scraper` extraction. PR 3 prompt verifies + merges this if still open.

## Source of truth

All PRs trace back to `docs/plans/2026-04-27-server-probe-design.md`. If a prompt and the design disagree, the design wins — fix the prompt and the PR.
