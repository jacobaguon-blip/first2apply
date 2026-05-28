# Desktop deploy — local + household

How to ship a desktop code change to your Mac (and optionally to "her"
machine) in one command.

> **npm is not installed on this Mac by design.** Every script in this flow
> uses `pnpm` exclusively and refuses to fall back to `npm`. If you ever see
> npm reappear on PATH, `deploy-local.sh` prints a warning so you can
> investigate before shipping.

## TL;DR

```bash
# Just this Mac (build + install + launch)
pnpm --filter first2apply-desktop deploy:local

# This Mac + push to "her" machine
pnpm --filter first2apply-desktop deploy:all
```

That's it. The rest of this doc explains what those commands do and the knobs
you can turn.

## Prereqs (one-time)

- macOS arm64 (Apple Silicon). The script refuses to run on anything else.
- `pnpm` on PATH. If missing: `corepack enable && corepack prepare pnpm@latest --activate`.
- `node` on PATH (Homebrew is fine).
- For `deploy:all` only: `~/.f2a/deploy.config` set up per
  `apps/desktopProbe/packagers/household/deploy-to-her.sh` header.
- For `deploy:all` only: `~/f2a-releases/latest/` directory exists (created
  automatically on first run by `publish-release.sh`).

## What each command does

### `pnpm deploy:local`

1. **Preflight.** Refuses non-darwin-arm64 hosts. Refuses to run if `pnpm` is
   missing. Warns (does not block) if `npm` is unexpectedly back on PATH.
2. **Kill running app + dev session.** `scripts/kill-dev.sh` plus a polite
   AppleScript quit + `pkill` of the installed `.app`. The `.app` swap below
   would fail otherwise.
3. **Scrub `PUSHOVER_USER_KEY` from `.env`** for the duration of the build,
   then restore on exit via a `trap` (works even on crash). Same pattern
   `publish-release.sh` already uses — prevents your personal key from being
   baked into the distributable. A stale `.env.deploy-local-backup` from a
   prior crashed run is auto-recovered on entry.
4. **Build.** `pnpm make` → `electron-forge make --arch=arm64`. Output lands
   at `out/First 2 Apply-darwin-arm64/First 2 Apply.app`.
5. **Install atomically.** Existing `/Applications/First 2 Apply.app` is
   renamed to `First 2 Apply.previous.app` (rollback path), then the fresh
   build is `cp -R`'d into place. `xattr -dr com.apple.quarantine` so macOS
   doesn't Gatekeeper-prompt.
6. **Launch.** `open /Applications/First 2 Apply.app`.

### `pnpm deploy:local:refresh`

Same as `deploy:local`, plus runs `pnpm install` first with these flags:

- `--ignore-scripts` — **no `postinstall` from any dep can execute.** This is
  the dominant npm-ecosystem supply-chain mitigation.
- `--frozen-lockfile` — refuses to install if `pnpm-lock.yaml` doesn't match
  exactly. No silent version drift.
- `--prefer-offline` — uses local cache where possible.

Use this when you've pulled new dependencies (someone changed
`pnpm-lock.yaml`) and want the install with the safest settings.

### `pnpm deploy:all`

Runs `deploy:local`, then chains the existing household publish + push:

1. `packagers/household/publish-release.sh` — stages the fresh build at
   `~/f2a-releases/latest`.
2. `packagers/household/deploy-to-her.sh` — `rsync`s the staged build to the
   target machine (via Tailscale or LAN, whichever is reachable first per
   `~/.f2a/deploy.config`'s `TARGETS` array) and triggers the remote
   `apply-update.sh`.

Skip steps 2-3 with `DEPLOY_LOCAL_ONLY=1`.

## Knobs (env vars)

| Var | Default | Effect |
|---|---|---|
| `DEPLOY_LAUNCH` | `1` | Launch the app after install. Set `0` to install only. |
| `DEPLOY_REFRESH_DEPS` | `0` | Run `pnpm install --ignore-scripts --frozen-lockfile --prefer-offline` before building. |
| `DEPLOY_DRY_RUN` | `0` | Run preflight only — no build, no install, no launch. Sanity-check before a real deploy. |
| `DEPLOY_LOCAL_ONLY` | `0` | (`deploy-all.sh` only) Skip the household publish + push. |

## Rollback

Each `deploy:local` keeps the prior build at
`/Applications/First 2 Apply.previous.app`. To revert:

```bash
osascript -e 'tell application "First 2 Apply" to quit' || true
rm -rf "/Applications/First 2 Apply.app"
mv "/Applications/First 2 Apply.previous.app" "/Applications/First 2 Apply.app"
open "/Applications/First 2 Apply.app"
```

For the household machine, `apply-update.sh` on the target similarly keeps a
`.previous.app` you can SSH-restore.

## Security posture (why these scripts exist)

This deploy flow assumes:

- **No `npm` on the build host.** Scripts refuse to fall back to it.
- **No postinstall scripts ever execute** (when `DEPLOY_REFRESH_DEPS=1`).
- **No personal secrets in the distributable** (PUSHOVER_USER_KEY scrubbed).
- **Atomic install with rollback.** Failures don't leave the Mac with no
  app or a half-installed app.
- **`.env` restored on crash.** A `trap`-protected backup means an OOM-killed
  build won't strand the dev `.env` in scrubbed form.

What this flow does **not** do (deferred to future hardening if needed):

- **Apple code-signing.** `xattr -dr com.apple.quarantine` is the trade —
  household app, single-tenant, no Gatekeeper signal. For broader
  distribution we'd add `electron-osx-sign` + a Developer ID cert.
- **Notarization.** Same reason as signing.
- **Reproducible builds.** Lockfile + `--frozen-lockfile` + `--ignore-scripts`
  get most of the way; full reproducibility would require a containerized
  build (e.g., move to building on the Pi or in CI).

If any of those become a priority, this script is a good starting point —
`deploy:local` is small and easy to wrap inside a Docker container or a CI
job that produces the same artifact.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm not on PATH` | pnpm uninstalled/moved. | `corepack enable && corepack prepare pnpm@latest --activate` |
| `PUSHOVER_USER_KEY scrub failed` | Unusual quoting in `.env`. | Manually scrub the key before running; the script bails to protect you. |
| `.app swap failed` | App is still running. | Quit it manually (Cmd-Q); re-run. The script tries to kill it but Electron sometimes hangs. |
| `out/...First 2 Apply.app not found` | Build failed silently (look upward in output). | Re-run with `DEPLOY_REFRESH_DEPS=1` to reinstall deps from lockfile. |
| Stale `.env.deploy-local-backup` | A prior run crashed before restore. | Script auto-recovers on next entry. If the unscrubbed key isn't restored, run `mv .env.deploy-local-backup .env` manually. |
