# PWA-on-Pi deploy — plan

**Date:** 2026-05-18
**Plan slug:** `pwa-pi-deploy`
**Target:** Host the existing `apps/webapp` PWA on the Raspberry Pi alongside the running `f2a-server-probe` service, reachable from the user's iPhone over Tailscale.

## TL;DR

The Pi already has a systemd unit (`f2a-web-ui.service`) reserved for a Next.js app on port 3030, with env file plumbing and a working directory (`/opt/first2apply/builds/web-ui`). The slot was created for the unbuilt `apps/serverWebUI` scaffold. Repurpose it for the real `apps/webapp` PWA. Transport is rsync of the Next.js standalone output. Public access is via `tailscale serve` (TLS handled by Tailscale; no Let's Encrypt). One systemd unit, no Docker for the webapp, no nginx changes needed for v1.

## Reasoning (frameworks)

- **Gall's Law** — Start simple: rsync + an existing systemd unit + `tailscale serve` is the smallest working system that delivers a hosted PWA. Add Docker/nginx/Let's Encrypt only when there's a concrete second need.
- **Reversibility** — Every step is two-way: rsync is just file copy, systemd restart is harmless, Tailscale serve is a single command to enable or disable. The only one-way doors are: enabling Tailscale Funnel (public internet exposure) — explicitly **not** done in v1; and creating GHCR images — explicitly **deferred**.
- **Hyrum's Law** — The systemd unit's contract is "Next.js app on port 3030 with `/opt/first2apply/.env` loaded." Anything depending on the *name* `serverWebUI` would be a leak. Confirm before deploy that nothing else on the Pi grep's `serverWebUI`.
- **YAGNI** — No CI workflow, no GHCR image build, no nginx config change, no LE certs, no admin/operator UI split. All deferred until evidence shows we need them.

## Artifact / component split

| Component | Owner | Notes |
|---|---|---|
| Next.js standalone build | `apps/webapp` | New `build:standalone` script. Output: `.next/standalone` + copy of `.next/static` + copy of `public/`. |
| Local release script | `scripts/deploy-webapp-to-pi.sh` (new) | Build → tarball → rsync → systemd restart on the Pi → smoke-check. Idempotent. |
| Pi runtime | existing `f2a-web-ui.service` | Already on the Pi; no Pi-side changes required v1. |
| Pi env | existing `/opt/first2apply/.env` | Must contain `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Verified before first deploy. |
| Public exposure | `tailscale serve` | `tailscale serve --bg --https=443 127.0.0.1:3030`. Reaches the user's iPhone via tailnet only. |
| Kill switch docs | `apps/webapp/README.md` | Add Pi-specific section: how to flip `KILL_SW` and redeploy. |

## Sprint plan

### Sprint 1 — Build artifact
- Add `build:standalone` script to `apps/webapp/package.json` that runs `next build --webpack` and bundles `.next/standalone`, `.next/static`, `public/` into `.next/standalone/` (Next.js standalone output convention).
- Verify `next.config.ts` has `output: 'standalone'`.
- Smoke: `pnpm --filter @first2apply/webapp build:standalone` produces a working bundle that can run with `node .next/standalone/apps/webapp/server.js`.

### Sprint 2 — Release script
- Write `scripts/deploy-webapp-to-pi.sh`:
  1. `pnpm --filter @first2apply/webapp build:standalone`
  2. `rsync -az --delete apps/webapp/.next/standalone/ first2apply@raspberrypi:/opt/first2apply/builds/web-ui/`
  3. `rsync -az apps/webapp/.next/static/ first2apply@raspberrypi:/opt/first2apply/builds/web-ui/apps/webapp/.next/static/`
  4. `rsync -az apps/webapp/public/ first2apply@raspberrypi:/opt/first2apply/builds/web-ui/apps/webapp/public/`
  5. `ssh first2apply@raspberrypi 'sudo systemctl restart f2a-web-ui.service'`
  6. `ssh first2apply@raspberrypi 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3030/'` → must be 200.
- `set -euo pipefail`. Idempotent: rerunning with no changes is a no-op rsync + a restart.
- Document Tailscale + SSH prerequisite at the top of the script.

### Sprint 3 — Patch f2a-web-ui.service for standalone output
- The current unit's `ExecStart` runs `node node_modules/next/dist/bin/next start -p ${PORT}`. The standalone bundle uses `node apps/webapp/server.js` instead and has no `node_modules` at the root.
- Update `deploy/pi/systemd/f2a-web-ui.service` to: `ExecStart=/usr/bin/node apps/webapp/server.js` with `WorkingDirectory=/opt/first2apply/builds/web-ui` and `Environment=PORT=3030 HOSTNAME=127.0.0.1`.
- Document the manual one-time install step (copy unit, `daemon-reload`, `enable`, `start`).

### Sprint 4 — Tailscale serve setup (Pi)
- One-time manual step (documented in `apps/webapp/README.md`): on the Pi, `sudo tailscale serve --bg --https=443 127.0.0.1:3030`.
- Verify from this Mac (over tailnet): `https://raspberrypi.<tailnet>.ts.net` returns the F2A login page.

### Sprint 5 — Verify SW + manifest paths are publicly served
- After the deploy and Tailscale serve, run `curl` against the public Tailscale hostname for `/`, `/sw.js`, `/manifest.webmanifest`, `/offline`, `/sw-reset`. All must return 200.
- The middleware fix from this morning's session (excluding these paths from auth) must already be committed before the deploy.

### Sprint 6 — Docs + kill switch ops
- Update `apps/webapp/README.md` with a new "Hosted on Pi" section: deploy command, expected URL, kill-switch flow (`KILL_SW = true` → rebuild → `scripts/deploy-webapp-to-pi.sh`).
- Cross-link to the design plan at `.claude/plans/2026-05-18-pwa-pi-deploy.md`.

## Out of scope (explicit YAGNI)

- GHCR image / Dockerfile for the webapp.
- GitHub Actions workflow that builds and deploys on push.
- Tailscale Funnel (public internet exposure).
- Let's Encrypt or a real public DNS hostname.
- nginx changes (the Pi may or may not have an nginx in front; Tailscale serve terminates TLS itself, so v1 doesn't need it).
- Separation of `apps/serverWebUI` and `apps/webapp`. We're not deleting `serverWebUI` — just leaving it dormant.
- Rollback automation (manual is fine for v1 — see below).
- Health-check timer or alerting (the user notices fast; tailnet-only blast radius).

## Rollback

- **Soft rollback (bad UI build):** rerun deploy script with a previous commit checked out locally. No state migration.
- **SW kill:** edit `apps/webapp/src/app/sw.ts` setting `KILL_SW = true`, bump `SW_VERSION`, rerun deploy script. All clients self-unregister on next activation.
- **Hard rollback (Pi-side disaster):** `ssh first2apply@raspberrypi 'sudo systemctl stop f2a-web-ui.service'`. The server-probe is on a different unit and is unaffected. The webapp goes dark; users who installed it see "you're offline" until the unit is restarted.
- **Worst case (corrupt build dir):** `ssh first2apply@raspberrypi 'sudo rm -rf /opt/first2apply/builds/web-ui/* && sudo systemctl stop f2a-web-ui.service'`, then rerun deploy.

## Review-loop resolutions (pass 1)

- **H1 — SSH user**: `scripts/deploy-webapp-to-pi.sh` reads `PI_SSH_TARGET` (default `first2apply@raspberrypi`). First action is `ssh -o BatchMode=yes -o ConnectTimeout=5 -o PasswordAuthentication=no "$PI_SSH_TARGET" 'true'`. Aborts loudly with remediation hint if auth fails.
- **H2 — uncommitted webapp**: Script runs `git diff --quiet -- apps/webapp` before build. If dirty, abort: "Commit or stash apps/webapp changes before deploying. Aborting." Prevents shipping a build from a dirty tree.
- **H3 — Supabase env on Pi**: Two checks. Preflight greps `/opt/first2apply/.env` for non-empty `SUPABASE_URL=` and `SUPABASE_ANON_KEY=`. Post-restart smoke includes a bogus-credentials POST that must return a Supabase-shaped 4xx (not 500, not redirect).
- **H4 — workspace deps in standalone**: `apps/webapp/next.config.ts` sets `output: 'standalone'` AND `outputFileTracingRoot: path.join(__dirname, '../..')`. Sprint 1 validates locally with `node .next/standalone/apps/webapp/server.js` on a free port before any rsync.
- **H5 — SW Cache-Control**: `next.config.ts` adds explicit `headers()` for `/sw.js` (`Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`) and `/manifest.webmanifest` (`Cache-Control: no-cache`). Kill switch reaches all clients within one revalidation.
- **H6 — NOPASSWD sudo**: Script uses `ssh -o BatchMode=yes -o PasswordAuthentication=no` so missing NOPASSWD fails loud, not hangs. README documents the one-time sudoers entry: `first2apply ALL=(ALL) NOPASSWD: /bin/systemctl restart f2a-web-ui.service, /bin/systemctl stop f2a-web-ui.service, /bin/systemctl start f2a-web-ui.service`.
- **H7 — smoke depth**: Post-restart smoke loops over `/`, `/sw.js`, `/manifest.webmanifest`, `/offline`, `/sw-reset` and asserts 200 on each, plus greps the `/sw.js` body for the `SW_VERSION` literal to confirm it's the real SW.

### Sprint plan delta from pass 1

- **Sprint 1** now also edits `apps/webapp/next.config.ts` to add `output`, `outputFileTracingRoot`, and `headers()`. Smoke validates SW headers locally.
- **Sprint 2** now: preflight (SSH reachability + env grep + working-tree clean), then build, then rsync, then restart, then deep smoke. `set -euo pipefail`. All SSH calls use `BatchMode=yes PasswordAuthentication=no`.
- **Sprint 6 (docs)** now includes the sudoers stanza and the `PI_SSH_TARGET` env override.

### Medium items accepted (not blocking)

- **M1** `output: 'standalone'` — folded into Sprint 1 via H4 resolution.
- **M2** `--delete` blast — accepted; `/opt/first2apply/builds/web-ui/` is single-purpose by convention.
- **M3** `User=first2apply` existence — folded into Sprint 1 preflight (the env grep proves the user can read the env file, which implies they exist).
- **M4** stale `.next/cache` — accept; if a deploy looks wrong, manual `rm -rf apps/webapp/.next` and rerun.
- **M5** branch mismatch — accept; deploy bakes the git SHA into a `/_meta` log line printed during smoke so we can see what shipped.

## Open assumptions to verify in Sprint 1

- [ ] Pi user is `first2apply` (per the systemd unit's `User=first2apply`); SSH key on this Mac must be authorized for that user, not `maadkal`.
- [ ] `/opt/first2apply/.env` on the Pi has `SUPABASE_URL` and `SUPABASE_ANON_KEY` matching the cloud Supabase project the iPhone will hit.
- [ ] The Pi has `node` (Node 22+) installed at `/usr/bin/node` (per the unit's `ExecStart`). Confirm with `ssh first2apply@raspberrypi 'node --version'`.
- [ ] The Pi's Tailscale node has HTTPS certs enabled (`tailscale cert` works). If not, a one-time enable in the admin console is required.
