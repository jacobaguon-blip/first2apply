# Server Probe — Design (v2)

**Date:** 2026-04-27
**Status:** Approved (brainstorming gate) → revised after devil's advocate round 1
**Author:** Jacob Aguon (with Claude as scribe)
**Related:** `decisions.md` Q6 (Pi server foundation), `MONDAY-STATUS.md` BLOCKER #7
**Supersedes (partial):** `decisions.md` Q6b — Electron-under-Xvfb is retained but the deployment path moves from raw `electron-builder` artifact to Docker image.

---

## 1. Goal

Stand up `apps/serverProbe` as a 24/7 headless scraper running on a Raspberry Pi 5 (Tailscale-only, alias `pi` / `100.93.137.31`) so first2apply continues scanning while the user's desktop is asleep. The desktop probe (Electron Mac/Windows app) continues to work unchanged; the server probe is additive.

The server-side admin web UI (`apps/serverWebUI`) remains a scaffold and is explicitly out of scope for this design. It is tracked separately.

---

## 2. Non-goals (v0)

- Multi-account multiplexing (single account; design **does not** claim this is mechanical — the cron + scrape pool model needs per-process or worker-thread isolation, which is out of scope here)
- `apps/serverWebUI` Next.js implementation
- Failover Supabase stack (`compose.standby.yaml` stays dormant; `F2A_FAILOVER` not used). Standby compose can drift from cloud schema if cloud changes; flagged for monitoring.
- Auto-update of the running container (manual `docker pull` + restart for now)
- Prometheus / metrics export
- Mezmo or any external log forwarder (logs stay on Pi via journald)
- Staging Supabase project (every PR/CI run hits the production cloud DB; acceptable v0 risk because reads dominate)

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
                                  │  health/healthServer │ NEW (small fastify)
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
   │ Electron main +     │         │ Electron main only,│         │  unchanged.        │
   │ tray + IPC + UI +   │         │ no UI, BrowserWin  │         │  Future cleanup:   │
   │ visible windows +   │         │ hidden offscreen,  │         │  rename — holds    │
   │ native Notification │         │ runs under Xvfb in │         │  non-UI Supabase   │
   │                     │         │ Docker             │         │  API. Out of scope)│
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

### 3.2 BrowserWindow rendering mode

The existing `HtmlDownloader` uses `new BrowserWindow({ show: false, ... })` — the window is hidden but the compositor still renders. This requires a real (or virtual) X display, which is why **Xvfb is mandatory in the Pi container even though the window is "hidden."**

Why not `webPreferences.offscreen: true` (true offscreen, no compositor)?
- Offscreen render is async-only (no synchronous DOM access patterns the existing scrapers use).
- Some sites detect offscreen-mode rendering signals (paint frequency anomalies) and serve different markup or block.
- The desktop scraper has been validated against 17 site providers using `show: false`. Switching modes risks regressions in code that's working.

Reusing `show: false` keeps server behavior identical to desktop behavior; the only operational delta is the Xvfb daemon supplying the display.

### 3.3 Health endpoint (added in PR 3, lives in `libraries/scraper`)

- Tiny HTTP server using `node:http` (no fastify dep — overkill for one endpoint).
- Bound to `127.0.0.1:7878` only (never exposed beyond Pi loopback).
- `GET /healthz` returns:
  - **200 OK** if `processStartedAt` is within the last `2 * cronIntervalMs` (bootstrap grace), OR
    if `Date.now() - lastSuccessfulScanFinishedAt < 2 * cronIntervalMs`.
  - **503 Service Unavailable** otherwise.
- The bootstrap grace window prevents a "container starts but first scan hasn't completed yet, healthcheck fails immediately" false negative.
- Used by Docker `HEALTHCHECK` and by the scanner's own self-monitor (the "stuck for 3 scans → self-pushover" loop).
- Source: `libraries/scraper/src/health/healthServer.ts`. The server is started by `apps/serverProbe` (not by `apps/desktopProbe` — the desktop has the OS-level Notification already).

### 3.4 Settings model

| App | Source | Notes |
|---|---|---|
| `apps/desktopProbe` | `settings.json` in Electron `userData` (current behavior) | No change |
| `apps/serverProbe` | env vars from `/opt/first2apply/.env` + runtime overrides from Supabase `user_settings` (quiet hours, pushover toggles) | The `user_settings` table already exists from `backlog/02-quiet-hours-v2`. v0 reads `user_settings` once at boot and on a 5-min refresh tick. |

### 3.5 Auth posture

- v0 uses **service-role key only** (full DB access, no RLS, no refresh logic). Stored in `/opt/first2apply/.env`, chmod 600, owned by `first2apply` user.
- Never anon-key + refresh-token paths. If a future requirement introduces per-user auth (e.g. multi-account from a UI), that's a separate design.

### 3.6 Multi-account posture

v0 is **explicitly single-account**. The "extension later is mechanical" claim from v1 of this design was wrong: `node-cron` schedules are process-global, and N scanners in one process compete for the same scrape pool. A real multi-account v1 needs either:
- (a) one OS process per account (each `f2a-server-probe@<userid>.service`), or
- (b) worker-thread isolation per account inside one container.

Both require non-trivial supervision logic. Out of scope for v0 — flagged for a future design doc.

### 3.7 Server `env` layer

`apps/serverProbe/src/env.ts` — small module that reads `process.env`, validates required keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`, `OPENAI_API_KEY`, `APPROVAL_HMAC_SECRET`), and exits with a clear error on startup if any are missing. No silent defaults for secrets.

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
  `libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgbm1 fonts-liberation xvfb`
- Copies built `libraries/{scraper,core}` and `apps/serverProbe`
- Entrypoint: `entrypoint.sh` starts `Xvfb :99 -screen 0 1280x720x24 &`, exports `DISPLAY=:99`, then execs `electron /app/main.js`. Includes `--selftest` short-circuit (used by CI runtime smoke).
- `HEALTHCHECK CMD wget -qO- http://127.0.0.1:7878/healthz || exit 1`

### 4.3 Container runtime flags (Chromium sandbox)

Electron/Chromium inside Docker fails its sandbox setup unless one of these is true. Choose explicitly:

| Option | Pros | Cons |
|---|---|---|
| `--cap-add=SYS_ADMIN` | Sandbox stays enabled | Container has elevated capability |
| `--no-sandbox` flag in Electron init | No host capability needed | Sandbox disabled (process-level isolation only) |

**Choice for v0:** `--no-sandbox` in the Electron app init. Rationale: Tailscale-only network + dedicated Linux user + dedicated container = process-level isolation is sufficient for our threat model. Avoids granting `SYS_ADMIN` to a long-running container.

**Critical ordering:** `app.commandLine.appendSwitch('no-sandbox')` MUST be called before `app.whenReady()`. If invoked after, the flag is silently ignored, Chromium fails to set up its sandbox, and the container is unable to render. PR 3's `main.ts` puts the appendSwitch call at the very top, before any other Electron API access. Tested via `--selftest` mode.

Document this in `apps/serverProbe/src/main.ts` with a comment block; not a silent magic flag.

### 4.4 Pi systemd unit

Updated `deploy/pi/systemd/f2a-server-probe.service`:

```
# Tolerate a stale container if a previous --rm didn't fire (rare but real
# when docker daemon hangs mid-stop). The leading `-` makes systemd ignore
# non-zero exit when nothing was there to remove.
ExecStartPre=-/usr/bin/docker rm -f f2a-server-probe
ExecStart=/usr/bin/docker run --rm --name f2a-server-probe \
          --env-file /opt/first2apply/.env \
          --network host \
          --shm-size=2g \
          ghcr.io/jacobaguon-blip/f2a-server-probe:latest
ExecStop=/usr/bin/docker stop -t 60 f2a-server-probe
Restart=on-failure
RestartSec=10
```

In CI workflows the registry path is `ghcr.io/${{ github.repository_owner }}/f2a-server-probe` (portable to forks/renames). The systemd unit on the Pi keeps the resolved path; if the repo moves, update both.

- `--network host` so the container reaches the Tailscale-routed Supabase URL without bridge gymnastics. Trade-off: container has full host network namespace access. Defensible because Tailscale is the only ingress and the host has no other public-facing services.
- `--shm-size=2g` because Chromium uses /dev/shm heavily and the default 64MB causes tab crashes on heavy pages.
- `--rm` removes the container on stop; logs survive only via journald (stdout). Container-local logs on disk would be lost — acceptable because we log to stdout exclusively.
- `-t 60` graceful stop window. Scanner finishes mid-page-load or aborts cleanly. `pg_dump.sh` runs in a separate `f2a-pg-dump.service` so this timeout doesn't affect dump integrity.
- The existing `first2apply` Linux user (created by bootstrap) runs Docker (already in `docker` group).
- v0 uses `:latest`; future state moves to immutable SHA tags + a `deploy.sh` that bumps the unit's image reference.

### 4.5 Pi pre-flight requirements (added to `bootstrap.sh`)

Bootstrap currently only checks docker. Adding:
- **chronyd or systemd-timesyncd active** — required for quiet-hours correctness. If `timedatectl show -p NTPSynchronized --value` returns false, bootstrap fails loudly **before any mutations**.
- **Final-step echo: docker login reminder.** Bootstrap prints "Next: `echo $PAT | docker login ghcr.io -u <user> --password-stdin`" so the user doesn't forget. (`--password-stdin` keeps the PAT out of shell history.)

(`/dev/shm` ≥ 2GB pre-flight removed — Docker `--shm-size=2g` carves out a private tmpfs from the kernel regardless of host /dev/shm size, so a host-side check would be misleading.)

### 4.6 Secrets

- `/opt/first2apply/.env` (chmod 600, owned by `first2apply`) ships into the container via `--env-file`.
- GHCR pull credentials live in Pi-side `~/.docker/config.json` (created by a one-time `docker login` on Pi); never in git.
- **PAT rotation:** GHCR auth uses a GitHub PAT. Modern fine-grained PATs default to ≤1y expiry. Recommend a **classic PAT scoped to `read:packages` only** (no expiry by default) to avoid silent failure when the token expires. Document the procedure in `deploy/pi/README.md`. Login form (always use `--password-stdin` to keep PAT out of shell history): `echo $PAT | docker login ghcr.io -u <user> --password-stdin`. Rotation: `docker logout ghcr.io && echo $NEW_PAT | docker login ghcr.io -u <user> --password-stdin`.
- `.env` file procedure: see `2026-04-27-pi-secrets-procedure.md` (to be written; uses `read -s` so secrets never enter shell history or scrollback).

### 4.7 Observability

- Logs → container stdout → `journalctl -u f2a-server-probe`
- Failure self-alert: 3 consecutive failed scans → scanner self-pushovers an "I'm stuck" notification using the existing user creds
- pg-dump timer (already shipped, runs nightly at 03:15) writes to `/opt/first2apply/data/`, 7-day retention. **Failure alert:** PR 4 wraps the existing `pg_dump.sh` to call `dispatchPushoverSummary`-equivalent on non-zero exit (a small inline `curl https://api.pushover.net` shell helper, since the lib isn't in shell path). Without this wrapper the failure is silent — only journalctl shows it.
- Stuck-tab detection via the `/healthz` indirect signal (see §3.3); explicit BrowserWindow watchdog deferred until the failure mode is observed in practice.

### 4.8 Failure modes & mitigations

| Failure | Detection | Mitigation |
|---|---|---|
| Chromium crash inside Electron | `/healthz` stale | systemd `Restart=on-failure` cycles container |
| Xvfb dies | Electron exits | Same |
| Pi loses Tailscale | Supabase calls fail | 3-failure self-alert |
| Pi disk fills (pg_dumps stack) | pg_dump.sh fails | 7-day retention; alert on error |
| `.env` missing | Container fails to start | systemd retries; journalctl shows error |
| Cloud DB down | All scans fail | Same as Tailscale loss |
| GHCR PAT expired | `docker pull` fails on next deploy | journalctl error; rotate per §4.6 |
| Pi clock drift | Quiet hours misfire | NTP pre-flight in bootstrap (§4.5) |
| Image cache fills disk | Eventual disk pressure | `deploy.sh` runs `docker image prune -f` after every successful pull |
| Bad image pushed to `:latest` | Container restart-loops on bad code | `deploy.sh` retags previous `:latest` as `:previous` before pulling, enabling 1-command rollback |

---

## 5. Migration plan

Five PRs, strict order, each independently reviewable and revertible.

### PR 1 — Regression net (no behavior change)

Lock in current scraper behavior so PR 2's move is provably safe.

- New: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`
- Set up vitest in `apps/desktopProbe` (no test runner exists today; the 6 existing `*.test.ts` files use a hand-rolled inline-harness pattern run via ad-hoc `tsx`)
- Migrate `apps/desktopProbe/src/server/notifications/quietHours.test.ts` from inline harness to vitest (it ends up in `libraries/scraper` in PR 2)
- Add 4 `JobScanner` orchestration tests as the tripwire
- Wire `nx run first2apply-desktop:test` to vitest
- Defer migrating the other 5 inline-harness tests — they protect code that doesn't move in PR 2
- Defer `HtmlDownloader` regression test — its Electron coupling makes unit testing impractical without already doing PR 2's BrowserWindow-injection refactor. Mitigation: `JobScanner` tests verify the orchestrator behavior; PR 2 verifies via a desktop-app launch + manual scan smoke test.
- **Pass condition:** all migrated + new tests green; existing typecheck still clean
- **Detailed task plan:** `2026-04-27-pr1-regression-net.md`

### PR 2 — Extract `libraries/scraper` (no behavior change)

Mechanical move. PR 1 tests prove no orchestrator regression.

- Create `libraries/scraper/{src,package.json,tsconfig.json}`
- Add to `pnpm-workspace.yaml` under existing libraries entry: `'libraries/scraper'`
- Move 7 files (htmlDownloader, jobScanner, browserHelpers, notifications/{dispatch,quietHours,pushover}, helpers)
- Define interfaces in `libraries/scraper/src/types.ts` (Section 3.1)
- Update `apps/desktopProbe` imports
- Electron-coupled bits become *adapter classes* in `apps/desktopProbe` injected via DI
- Move PR 1 tests with the files; add unit tests for the new interfaces
- Wire root `tsconfig.json` paths
- **Pass condition:** PR 1 tests still pass + new unit tests pass + desktop app launches and runs a scan locally

### PR 3 — Implement `apps/serverProbe`

Thin Electron shell. Realistic effort: **1.5–2 days** (revised up from "1 day").

- Rewrite `apps/serverProbe/src/main.ts` as Electron main process
- Add `apps/serverProbe/src/env.ts` (§3.7)
- Add real deps: `electron` (pinned to the same major version as `apps/desktopProbe` to keep the Chromium engine consistent across desktop and server), `@first2apply/scraper`, `@first2apply/core`, `@supabase/supabase-js`
- Add `libraries/scraper/src/health/healthServer.ts` (§3.3) — used by serverProbe, not desktop
- Adapter implementations: env-driven `ISettingsProvider`, console+file `ILogger`, no-op `IAnalyticsClient`, hidden-window `IBrowserWindowFactory`
- `app.commandLine.appendSwitch('no-sandbox')` per §4.3
- Local Xvfb test target: `xvfb-run electron .` on a Linux box; on Mac, run inside the Docker image via `docker run -it`
- `--probe-once` mode preserved; add `--selftest` mode (verifies Electron + Xvfb start, exits 0)
- **Pass condition:** `serverProbe --probe-once` runs end-to-end against the production Supabase account inside Docker (Pi or laptop) — pollutes prod DB with one scan, accepted

### PR 4 — Dockerfile + Pi systemd unit update

Production deployment plumbing.

- Add `apps/serverProbe/Dockerfile` (§4.2)
- Add `apps/serverProbe/entrypoint.sh` (Xvfb + Electron + --selftest hook)
- Update `deploy/pi/systemd/f2a-server-probe.service` to use `docker run` (§4.4)
- Update `deploy/pi/bootstrap.sh` to add NTP + /dev/shm pre-flight checks (§4.5)
- Update `deploy/pi/.env.example` to include `F2A_PUSHOVER_MOCK=0` (already done in this revision)
- Add `deploy/pi/deploy.sh`:
  - Tags current `:latest` as `:previous` (rollback path)
  - `docker pull ghcr.io/.../f2a-server-probe:latest`
  - `docker image prune -f` (cache cleanup)
  - `systemctl restart f2a-server-probe.service`
  - Idempotent
- Add `apps/serverProbe/.dockerignore`
- **Pass condition:** image builds for `linux/arm64`; `docker run` on Pi completes one `--probe-once` cycle against the production account; `f2a-pg-dump.service` runs successfully on a manual `systemctl start` trigger before the timer is enabled.

### PR 5 — CI

Gate future PRs on regression tests + image build + runtime smoke.

- New: `.github/workflows/ci.yml`
- Jobs:
  - `typecheck`: `pnpm install`, `nx run-many -t typecheck`
  - `test`: `nx run-many -t test --exclude=@first2apply/node-backend,@first2apply/invoice-downloader` (those have `exit 1` noop test scripts; replace or exclude)
  - `build-server-probe-image`: `docker buildx build --platform linux/arm64 --load -t f2a-server-probe:ci --cache-from type=gha --cache-to type=gha,mode=max .` — gha cache so PR rebuilds reuse Chromium-installing layers (~5min cold → ~30s warm)
  - `runtime-smoke-server-probe`: `docker run --rm f2a-server-probe:ci /usr/local/bin/entrypoint.sh --selftest` — verifies the image actually boots Xvfb + Electron, exits 0 only if both came up
  - All jobs verify-only on PRs; image push happens only on merges to master via separate `release.yml` (workflow with `permissions: packages: write`)
- Add `CODEOWNERS` stub
- Update PR template to require `## Test plan` section
- Replace or fix `exit 1` test scripts in: `apps/nodeBackend/package.json`, `apps/invoiceDownloader/package.json`
- **Pass condition:** CI green on a no-op PR

### Post-merge: Pi go-live (manual, not a PR)

```bash
ssh pi
docker login ghcr.io -u <github-user>      # one-time, classic PAT scoped read:packages
sudo bash /opt/first2apply/deploy/deploy.sh   # pulls :latest, prunes cache, restarts unit
sudo systemctl enable f2a-server-probe.service
journalctl -u f2a-server-probe -f             # watch first scan happen
```

Rollback at any time: `sudo systemctl disable --now f2a-server-probe.service` (preserve bootstrap state) or `docker tag f2a-server-probe:previous :latest && systemctl restart f2a-server-probe.service` for fast image rollback.

---

## 6. Effort estimate (revised after round 1)

| PR | Time |
|---|---|
| PR 1 — Regression net | ~half day |
| PR 2 — Library extraction | ~half day |
| PR 3 — serverProbe impl | **1.5–2 days** (was "1 day"; bumped for env layer + health server + entrypoint hardening + Xvfb integration debugging) |
| PR 4 — Docker + systemd | ~half day |
| PR 5 — CI | ~half day |
| **Total** | **~3.5–4 days** (was "~3 days") |

Plus user time: smoke test in PR 3 against own account, paste three secrets into Pi `.env`, watch first live scan.

---

## 7. Open questions / future work

- **Multi-account multiplexer**: real design needed; not "mechanical." Either per-process or worker-thread per account.
- **Image registry choice**: GHCR is the default. If GHCR auth becomes annoying, consider Docker Hub or self-hosted registry on Pi.
- **Webapp wiring**: the existing webapp (`apps/webapp`) doesn't currently talk to the server probe. Future work: `serverWebUI` or extending `apps/webapp` to surface server-probe scan status.
- **Stuck-tab watchdog inside Electron**: the `/healthz` indirect signal is a v0 minimum. A direct watchdog (renderer reports liveness to main) would be more precise — defer until we see the failure mode in practice.
- **`libraries/ui` rename**: it holds non-UI Supabase API. Future cleanup; not blocking.
- **Staging Supabase project**: every PR/CI run hits production cloud DB. Acceptable v0 because reads dominate; revisit if write-side regressions become a concern.
- **Empty-scan signal**: when the scanner finds 0 new jobs, no Pushover fires. After several quiet days a user can't tell "it's running fine" from "it's silently broken." Future: add a daily digest that fires even with 0 new jobs.
- **Inline-harness test migration backlog**: PR 1 excludes the 5 remaining inline-harness tests (`tailored/builder`, `masterContent/parse`, `connections/connections`, `ai/budget`, `keywords/keywords`) from vitest. They no longer get exercised by `nx run-many -t test`. Tracked as a follow-up: migrate to vitest in a separate PR after the server-probe sequence ships.
- **Migration ordering risk**: if PR 1 merges and PR 2 stalls, master is in a "vitest configured, legacy harness tests excluded" state. No regression (the harness tests weren't running before either) but worth tracking.

---

## 8. Approval

Approved by user 2026-04-27 (brainstorming gate). Revised after devil's advocate round 1 (32 issues fixed inline). Next step: writing-plans skill produces per-PR execution plans starting with PR 1.
