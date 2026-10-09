# QA harness

Entry point: `qa/run-qa.sh <fast|unit|ui|all>` (or `pnpm qa`, `pnpm qa:fast`, `pnpm qa:unit`, `pnpm qa:ui`).

| Tier | Checks                                                                             | Typical time                        |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| fast | backend `deno check` vs baseline, desktop `tsc`, prettier on changed backend files | 3s                                  |
| unit | `deno test` jobListParser, desktop vitest                                          | 5s                                  |
| ui   | Playwright smoke and authenticated specs against the packaged desktop app          | 10s (plus a one-time package build) |

A run fails only on NEW failures. Known failures live in `qa/known-failures.json` with a reason each.

## Git hooks

- pre-push runs `pnpm typecheck` (nx, all projects, exits 0 on master) and `qa:unit`. `qa:fast` stays available for on-demand use.
- post-merge runs `qa:unit` and reminds you to run `qa/run-qa.sh ui` when `apps/desktopProbe` or `libraries/` changed.
- Hooks print a warning and continue when an optional tool (deno) is missing.

## Why the UI tier uses a CDP proxy

The app creates hidden helper pages in separate Electron partitions. Playwright waits on every page it auto-attaches to, and those pages never respond, so `_electron.launch` and `connectOverCDP` both time out. The fixture (`qa/ui/fixtures.ts`) starts the packaged binary itself with `--remote-debugging-port=0`, puts `qa/ui/cdpFilterProxy.ts` in front of the DevTools socket to hide non-window pages, and attaches Playwright to the proxy.

We use the packaged app (`apps/desktopProbe/out`, built by `pnpm --filter first2apply-desktop package`) because it needs no dev server and runs headlessly from a finished bundle. Each run uses a temporary `--user-data-dir`, so your real data and login are untouched.

## Authenticated specs

The runner loads the QA login from the macOS Keychain (service `f2a-qa`) when `F2A_QA_EMAIL`/`F2A_QA_PASSWORD` are not set, and the app is packaged with the real `apps/desktopProbe/.env`. Otherwise those specs SKIP. Never commit credentials.\n\nThe QA account and its fixture data (4 jobs, 1 never-scanned search, 3 connections for `qa/ui/03-referrals.spec.ts`, `career_ops_enabled`) are created by `qa/seed-qa-account.sh`, which needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the Pi has both in `/opt/first2apply-mono/apps/backend/supabase/functions/.env`). It is idempotent.

## Reports

`qa/reports/<timestamp>.md`, logs in `qa/reports/<timestamp>/`, screenshots in `qa/reports/<timestamp>/screenshots/`. All gitignored.

See `.claude/skills/f2a-qa/SKILL.md` for the full workflow.
