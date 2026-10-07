---
name: f2a-qa
description: Use when you need to QA first2apply changes, verify a merge to master, run the tiered QA harness (fast, unit, ui), add a UI spec, update the known-failures baseline, or read QA reports and screenshots.
---

# f2a-qa

Tiered QA harness in `qa/`. One entry point: `qa/run-qa.sh <tier>`. Exit code is nonzero only for NEW failures (not in `qa/known-failures.json`).

## Merge rule

1. Every merge to master must have `qa/run-qa.sh unit` green (no new failures).
2. Any change touching `apps/desktopProbe` or `libraries/` also needs `qa/run-qa.sh ui` run before it counts as done.
3. The `.husky/post-merge` hook runs the unit tier and prints a UI reminder when those paths changed. The reminder does not run the UI tier for you.

## Which tier when

| Tier | Run when | Cost | What it does |
|------|----------|------|--------------|
| `fast` | before every commit or push (pre-push runs it) | ~3s | backend `deno check` vs baseline count, desktop `tsc --noEmit`, prettier on changed backend files |
| `unit` | after any code change, after every merge | ~5s | `deno test` of `jobListParser.test.ts`, desktop vitest |
| `ui` | desktop or library changes, before shipping a build | ~10s plus package time on first run | Playwright against the packaged app |
| `all` | before merging to master | sum | fast, unit, ui |

## How to run

```
qa/run-qa.sh unit            # or: pnpm qa:unit
qa/run-qa.sh ui              # or: pnpm qa:ui
pnpm qa                      # all tiers
```

- First `ui` run installs `qa/node_modules` (isolated, `pnpm install --ignore-workspace`) and packages the app with `pnpm --filter first2apply-desktop package` when `apps/desktopProbe/out` is missing or older than the sources. Override the binary with `F2A_QA_APP_BINARY`.
- The app always runs with a throwaway `--user-data-dir` and `F2A_PAUSE_SCANS=1`. It never touches your real app data or `/Applications`.
- Without `apps/desktopProbe/.env` the build uses inert placeholder backend values, which is enough for unauthenticated specs.

## Auth env vars (optional)

- `F2A_QA_EMAIL` and `F2A_QA_PASSWORD` enable `qa/ui/02-authenticated.spec.ts` (log in, visit every main page, check the sort control and location filter, screenshot each page).
- They also need a build against a real backend, so keep a real `apps/desktopProbe/.env` in place when packaging.
- Pass them in the shell environment only. Never write credentials into files.
- Without them those specs report SKIP, not FAIL.

## Reading reports

- Table printed at the end of each run. Statuses: PASS, KNOWN (matches baseline), SKIP, FAIL (new failure).
- Markdown report: `qa/reports/<timestamp>.md`.
- Logs per step: `qa/reports/<timestamp>/*.log` (deno-check, deno-test, vitest, playwright, package).
- Screenshots: `qa/reports/<timestamp>/screenshots/*.png`. Open them to judge layout, not just pass/fail.
- All of `qa/reports/` is gitignored.

## Add a UI spec

1. Create `qa/ui/NN-name.spec.ts`. Import `launchApp`, `shot`, `hasCreds`, `relevantErrors` from `./fixtures`.
2. Read the real code for selectors (`apps/desktopProbe/src/app.tsx` for routes, `components/navbar.tsx` for nav links). The app has no `data-testid` attributes, so use roles, labels, visible text, or `nav a[href="/path"]`.
3. Call `shot(page, 'name')` for screenshots. Do not call `page.screenshot` directly, it can stall on a backgrounded window.
4. Auth-dependent specs must start with `test.skip(!hasCreds, '<clear reason>')`.
5. Run `cd qa && npx playwright test ui/NN-name.spec.ts` while iterating.

## Update known-failures.json

Only with a stated reason, in the same commit, written in the `reason` field.

- Add a test name to `known_failing_tests` only when it fails on master and is not caused by your change.
- Raise `backend_typecheck.error_count` never. Lower it when you fix errors.
- When a run prints "known failure now passes", remove it from the file.
- Never add a failure just to make a run green.

## Gotchas

- `_electron.launch` and `chromium.connectOverCDP` hang against this app because its hidden HTML-downloader pages never answer Playwright's attach. `qa/ui/cdpFilterProxy.ts` hides those pages. Do not replace the fixture with `_electron.launch`.
- The app can hang on quit when the backend is unreachable, so the fixture SIGKILLs it.
- deno rewrites `apps/backend/supabase/functions/deno.lock`. The runner restores it with `git checkout`.
- `pnpm run typecheck` (nx, all projects) already fails on master (backend baseline errors, blog contentlayer). Pre-push uses `qa:fast` and `qa:unit` instead.
