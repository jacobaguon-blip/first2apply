# Server Probe — Design

**Date:** 2026-04-27
**Status:** Approved (brainstorming gate)
**Author:** Jacob Aguon (with Claude as scribe)
**Related:** `decisions.md` Q6 (Pi server foundation), `MONDAY-STATUS.md` BLOCKER #7
**Supersedes (partial):** `decisions.md` Q6b — Electron-under-Xvfb is retained but the deployment path moves from raw `electron-builder` artifact to Docker image.

---

## 1. Goal

Stand up `apps/serverProbe` as a 24/7 headless scraper running on a Raspberry Pi 5 (Tailscale-only, alias `pi` / `100.93.137.31`) so first2apply continues scanning while the user's desktop is asleep. The desktop probe (Electron Mac/Windows app) continues to work unchanged; the server probe is additive.

The server-side admin web UI (`apps/serverWebUI`) remains a scaffold and is explicitly out of scope for this design. It is tracked separately.

---

## 2. Non-goals (v0)

- Multi-account multiplexing (single account; design accommodates extension later)
- `apps/serverWebUI` Next.js implementation
- Failover Supabase stack (`compose.standby.yaml` stays dormant; `F2A_FAILOVER` not used)
- Auto-update of the running container (manual `docker pull` + restart for now)
- Prometheus / metrics export
- Mezmo or any external log forwarder (logs stay on Pi via journald)

---

## 3. Architecture

Three layers:

```
                                  ┌──────────────────────┐
                                  │  libraries/scraper   │  NEW
                                  │                      │
                                  │  HtmlDownloader      │
                                  │  JobScanner          │
                                  │  browserHelpers      │
                                  │  notifications/{     │
                                  │    dispatch,         │
                                  │    quietHours,       │
                                  │    pushover          │
                                  │  }                   │
                                  │  helpers, types      │
                                  └──────────┬───────────┘
                                             │ DI: BrowserWindow factory,
                                             │     ILogger, ISettingsProvider,
                                             │     IAnalyticsClient
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
   ┌──────────▼──────────┐         ┌─────────▼──────────┐         ┌─────────▼──────────┐
   │ apps/desktopProbe   │         │ apps/serverProbe   │  REWRITE│ libraries/ui       │
   │                     │         │                    │         │ (existing,         │
   │ Electron main +     │         │ Electron main only,│         │  unchanged)        │
   │ tray + IPC + UI +   │         │ no UI, BrowserWin  │         │                    │
   │ visible windows +   │         │ offscreen, runs    │         │                    │
   │ native Notification │         │ under Xvfb in      │         │                    │
   │                     │         │ Docker             │         │                    │
   └─────────────────────┘         └────────────────────┘         └────────────────────┘
```

### 3.1 Library design rules (`libraries/scraper`)

- The library does not import from `electron`. The `BrowserWindow` class and any `Session`/protocol types it needs are injected via constructor parameters.
- The library defines four interfaces in `src/types.ts`:
  - `ILogger` — already implicitly used by `JobScanner`; formalized.
  - `IAnalyticsClient` — already implicitly used; formalized.
  - `ISettingsProvider` — abstracts disk-vs-env-vs-Supabase settings storage.
  - `IBrowserWindowFactory` — `() => BrowserWindow`. Each app supplies its own.
- Notifications: `dispatchPushoverSummary` (cross-platform) lives in the lib. Native `Notification` (macOS/Windows toast) stays in `apps/desktopProbe`.
- The lib has no app-singleton dependencies (no `app.whenReady`, no `userData` paths).

### 3.2 Settings model

| App | Source | Notes |
|---|---|---|
| `apps/desktopProbe` | `settings.json` in Electron `userData` (current behavior) | No change |
| `apps/serverProbe` | env vars from `/opt/first2apply/.env` + runtime overrides from Supabase `user_settings` (quiet hours, pushover toggles) | The `user_settings` table already exists from `backlog/02-quiet-hours-v2` |

### 3.3 Multi-account posture

v0 ships single-account. The `JobScanner` constructor already accepts a `userId`-scoped `F2aSupabaseApi`, so the multi-account version is a top-level multiplexer that instantiates one scanner per active user. Out of scope for this design but the seam is preserved.

---

## 4. Deployment & operations

### 4.1 Build pipeline

```
laptop (Mac arm64)             GitHub Actions             Pi (Linux arm64)
─────────────────────          ──────────────────         ─────────────────────
git push <branch>     ───►    docker buildx
                              --platform linux/arm64
                              --tag ghcr.io/.../
                                f2a-server-probe:<sha>
                              --push
                                                    ───► docker pull <tag>
                                                         systemctl restart
                                                           f2a-server-probe
```

### 4.2 Image (`apps/serverProbe/Dockerfile`)

- Base: `node:22-bookworm-slim` (Debian, matches Pi OS, glibc-compatible)
- Adds Xvfb + Chromium runtime libs:
  `libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgbm1 fonts-liberation`
- Copies built `libraries/{scraper,core}` and `apps/serverProbe`
- Entrypoint: `entrypoint.sh` starts Xvfb on `:99`, execs `electron /app/main.js` with `DISPLAY=:99`
- `HEALTHCHECK` hits `127.0.0.1:7878/healthz` — returns 200 only if the last scan completed within `2 × cron_interval`. Detects stuck-but-alive states (frozen Chromium tab) that pure process liveness misses.

### 4.3 Pi systemd unit

Updated `deploy/pi/systemd/f2a-server-probe.service`:

```
ExecStart=/usr/bin/docker run --rm --name f2a-server-probe \
          --env-file /opt/first2apply/.env \
          --network host \
          ghcr.io/jacobaguon-blip/f2a-server-probe:latest
ExecStop=/usr/bin/docker stop -t 30 f2a-server-probe
Restart=on-failure
RestartSec=10
```

- `--network host` so the container reaches the Tailscale-routed Supabase URL without bridge gymnastics.
- The existing `first2apply` Linux user (created by bootstrap) runs Docker (already in `docker` group).
- v0 uses `:latest`; future state moves to immutable SHA tags + a `deploy.sh` that bumps the unit's image reference.

### 4.4 Secrets

- `/opt/first2apply/.env` (chmod 600, owned by `first2apply`) ships into the container via `--env-file`.
- GHCR pull credentials live in Pi-side `~/.docker/config.json` (created by a one-time `docker login` on Pi); never in git.

### 4.5 Observability

- Logs → container stdout → `journalctl -u f2a-server-probe`
- Failure self-alert: 3 consecutive failed scans → scanner self-pushovers an "I'm stuck" notification using the existing user creds
- pg-dump timer (already shipped, runs nightly at 03:15) writes to `/opt/first2apply/data/`, 7-day retention

### 4.6 Failure modes & mitigations

| Failure | Detection | Mitigation |
|---|---|---|
| Chromium crash inside Electron | `/healthz` stale | systemd `Restart=on-failure` cycles container |
| Xvfb dies | Electron exits | Same |
| Pi loses Tailscale | Supabase calls fail | 3-failure self-alert |
| Pi disk fills (pg_dumps stack) | pg_dump.sh fails | 7-day retention; alert on error |
| `.env` missing | Container fails to start | systemd retries; journalctl shows error |
| Cloud DB down | All scans fail | Same as Tailscale loss |

---

## 5. Migration plan

Five PRs, strict order, each independently reviewable and revertible.

### PR 1 — Regression net (no behavior change)

Lock in current scraper behavior so PR 2's move is provably safe.

- New: `apps/desktopProbe/src/server/__tests__/scraper.regression.test.ts`
- Fixtures: `tests/fixtures/scrape/{linkedin,glassdoor,remoteok,…}.html`
- Coverage: parse 1+ jobs per provider for top 5 providers (LinkedIn, Glassdoor, Indeed, RemoteOK, WeWorkRemotely)
- Pure parser tests, no live network
- Runner: vitest
- Wire `nx run @first2apply/desktopProbe:test` (currently noop) into vitest config
- **Pass condition:** all tests green on master baseline

### PR 2 — Extract `libraries/scraper` (no behavior change)

Mechanical move. PR 1 tests prove no regression.

- Create `libraries/scraper/{src,package.json,tsconfig.json}`
- Move 7 files (htmlDownloader, jobScanner, browserHelpers, notifications/{dispatch,quietHours,pushover}, helpers)
- Define interfaces in `libraries/scraper/src/types.ts` (Section 3.1)
- Update `apps/desktopProbe` imports
- Electron-coupled bits (BrowserWindow factory, native Notification, settings.json provider) become *adapter classes* in `apps/desktopProbe` that implement the lib's interfaces and get injected
- Move PR 1 tests with the files; add unit tests for the new interfaces (mock factory, mock supabase)
- Wire into `pnpm-workspace.yaml`, root `tsconfig.json` paths
- **Pass condition:** PR 1 tests still pass + new unit tests pass + desktop app launches and runs a scan locally

### PR 3 — Implement `apps/serverProbe`

Thin Electron shell.

- Rewrite `apps/serverProbe/src/main.ts` as Electron main process
- Add real deps: `electron`, `@first2apply/scraper`, `@first2apply/core`, `@supabase/supabase-js`
- Adapter implementations: env-driven `ISettingsProvider`, console+file `ILogger`, no-op `IAnalyticsClient`, offscreen-only `IBrowserWindowFactory`
- Local Xvfb test target: `nx run` script that spins up `xvfb-run` + serverProbe on dev machine (Docker on Mac since Mac has no Xvfb natively)
- `--probe-once` mode preserved
- **Pass condition:** `serverProbe --probe-once` runs end-to-end against a real Supabase test account inside Docker (Pi or laptop)

### PR 4 — Dockerfile + Pi systemd unit update

Production deployment plumbing.

- Add `apps/serverProbe/Dockerfile` (Section 4.2)
- Add `apps/serverProbe/entrypoint.sh`
- Update `deploy/pi/systemd/f2a-server-probe.service` to use `docker run` (Section 4.3)
- Add `deploy/pi/deploy.sh` — idempotent one-command pull + restart on Pi
- Add `apps/serverProbe/.dockerignore`
- **Pass condition:** image builds for `linux/arm64`; `docker run` on Pi completes one `--probe-once` cycle against test account

### PR 5 — CI

Gate future PRs on regression tests + image build.

- New: `.github/workflows/ci.yml`
- Jobs:
  - `typecheck`: `pnpm install`, `nx run-many -t typecheck`
  - `test`: `nx run-many -t test`
  - `build-server-probe-image`: `docker buildx build --platform linux/arm64` (verify-only on PRs; push only on merges to master via separate `release.yml`)
- Add `CODEOWNERS` stub
- Update PR template to require `## Test plan` section
- **Pass condition:** CI green on a no-op PR

### Post-merge: Pi go-live (manual, not a PR)

```bash
ssh pi
docker login ghcr.io                                         # one-time
sudo bash /opt/first2apply/deploy/deploy.sh                  # pulls :latest, restarts
sudo systemctl enable f2a-server-probe.service
journalctl -u f2a-server-probe -f                            # watch first scan
```

Rollback at any time: `sudo systemctl disable --now f2a-server-probe.service`. Bootstrap remains intact.

---

## 6. Effort estimate (honest)

| PR | Time |
|---|---|
| PR 1 — Regression net | ~half day |
| PR 2 — Library extraction | ~half day |
| PR 3 — serverProbe impl | ~1 day |
| PR 4 — Docker + systemd | ~half day |
| PR 5 — CI | ~half day |
| **Total** | **~3 days** |

Plus user time: smoke test in PR 3 against own account, paste three secrets into Pi `.env` (per `2026-04-27-pi-secrets-procedure`), watch first live scan.

---

## 7. Open questions / future work

- **Multi-account multiplexer**: when ready, design a top-level `MultiAccountSupervisor` that holds one `JobScanner` per active user. Probably gated on the `serverWebUI` shipping (so admins can manage accounts).
- **Image registry choice**: GHCR is the default. If GHCR auth becomes annoying, consider Docker Hub or self-hosted registry on Pi.
- **Webapp wiring**: the existing webapp (`apps/webapp`) doesn't currently talk to the server probe. Future work: `serverWebUI` or extending `apps/webapp` to surface server-probe scan status.
- **Stuck-tab detection inside Electron**: the `/healthz` indirect signal is a v0 minimum. A direct watchdog inside the BrowserWindow (renderer reports liveness back) would be more precise — defer until we see the failure mode in practice.

---

## 8. Approval

Approved by user 2026-04-27 (brainstorming gate). Next step: writing-plans skill produces a per-PR execution plan covering tests, code paths, and verification steps. No implementation begins until the per-PR plan is also approved.
