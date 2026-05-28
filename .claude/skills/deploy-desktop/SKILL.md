---
name: deploy-desktop
description: Build, install, and launch the First 2 Apply desktop app on this Mac (and optionally push to "her" machine). Use when the user says deploy / ship / update the desktop / rebuild and run / package and install.
---

# Deploy Desktop

Single command from a fresh code change to a running new desktop app on this
Mac. Optionally chains the household push to "her" machine.

## When to use

Invoke when the user says any of:

- "deploy the desktop", "deploy desktop"
- "ship the changes", "ship it"
- "update my app", "rebuild and run", "package and install the new version"
- "deploy to her too", "ship everywhere", "rollout" → full chain
- "redeploy local-only", "skip her" → local only

These are reversible (a `.previous.app` is kept) so you do NOT need to ask
permission before running. Confirm only if the user asks to git push or
publish externally — those are still one-way doors.

## Decision

Pick the command based on user intent:

| User intent | Command |
|---|---|
| Just this Mac (default) | `pnpm --filter first2apply-desktop deploy:local` |
| This Mac + push to her | `pnpm --filter first2apply-desktop deploy:all` |
| This Mac, refresh deps first (no postinstall scripts) | `pnpm --filter first2apply-desktop deploy:local:refresh` |
| Build + install but don't launch | `DEPLOY_LAUNCH=0 pnpm --filter first2apply-desktop deploy:local` |
| Dry-run preflight only | `DEPLOY_DRY_RUN=1 pnpm --filter first2apply-desktop deploy:local` |

Default to **just this Mac** unless the user explicitly mentions her machine,
rollout, or shipping everywhere.

## How to invoke (Bash tool)

Run from anywhere in the repo. The script is idempotent and survives crashes
(env scrub is `trap`-protected).

```bash
pnpm --filter first2apply-desktop deploy:local
```

The script will:

1. **Preflight** — refuse non-darwin-arm64, refuse if pnpm is missing, warn
   if npm is unexpectedly on PATH (does not block — `npm` is bundled with
   Homebrew's `node` formula, so seeing it is expected).
2. **Kill the running app + dev session** so the `.app` swap doesn't fail.
3. **Scrub `PUSHOVER_USER_KEY`** from `.env` during build (restored on exit
   via `trap`, even on crash).
4. **Build** via `pnpm make` (electron-forge make --arch=arm64).
5. **Atomic install** — moves current `/Applications/First 2 Apply.app` to
   `.previous.app`, copies the new build into place, strips Gatekeeper
   quarantine.
6. **Launch** the new app.

Build takes ~1–3 minutes on a modern Mac. The script streams progress; don't
interrupt unless it's obviously stuck (no output for >5 minutes).

## Tell the user

After the script completes, report:

- The new version that was installed (printed by the script as
  `installed: First 2 Apply <version>`).
- That the previous build is at `/Applications/First 2 Apply.previous.app` if
  rollback is needed.
- If `deploy:all` was used: whether the household push step succeeded
  (deploy-to-her.sh prints which target it selected).

## Rollback

If a freshly-installed build misbehaves:

```bash
osascript -e 'tell application "First 2 Apply" to quit' || true
rm -rf "/Applications/First 2 Apply.app"
mv "/Applications/First 2 Apply.previous.app" "/Applications/First 2 Apply.app"
open "/Applications/First 2 Apply.app"
```

Run that without asking — it's the documented recovery path.

## Failure modes

| Error | Cause | Fix |
|---|---|---|
| `pnpm not on PATH` | pnpm uninstalled / moved | `corepack enable && corepack prepare pnpm@latest --activate` |
| `PUSHOVER_USER_KEY scrub failed` | Unusual quoting in `.env` | Surface to user; do NOT try to "fix" — the script bails to protect them |
| `Build output not found at out/...` | `pnpm make` failed silently | Re-run with `DEPLOY_REFRESH_DEPS=1` to reinstall deps from lockfile |
| `.app swap failed (file in use)` | App or dev session still holding files | The script tries; if it persists, ask user to Cmd-Q the app then re-run |

## What this skill does NOT do

- **Does not push commits.** `git push` is a one-way door; ask the user.
- **Does not bump version numbers.** That's release-it's job.
- **Does not run tests.** Already typecheck-gated; if you want a test pass,
  invoke `pnpm test` separately first.
- **Does not deploy the Pi-side local-AI stack.** That's a separate command:
  `ssh maadkal@raspberrypi 'bash /opt/first2apply-mono/deploy/deploy-local-ai.sh'`

## Reference

- Script: `apps/desktopProbe/scripts/deploy-local.sh`
- Chain: `apps/desktopProbe/scripts/deploy-all.sh`
- Full docs: `docs/DEPLOY-DESKTOP.md`
- CLAUDE.md trigger table: top of `CLAUDE.md`
