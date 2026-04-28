# PR 4 of 5 — Dockerfile + Pi systemd update

You are continuing the **server-probe** project for `first2apply`. PRs 1, 2, and 3 are merged. PR 4 is yours.

## Step 1 — Load context (always do this first)

Read these in order:

1. `docs/plans/2026-04-27-server-probe-design.md` — **the design doc.** PR 4's scope is in §5.PR-4; details in §4 (deployment), §4.2 (Dockerfile), §4.4 (systemd unit), §4.5 (bootstrap pre-flight).
2. `decisions.md` — most recent entries; specifically PR 3's log to know what shape the serverProbe ended up in.
3. `apps/serverProbe/src/main.ts` — the entry point Docker will exec.
4. `apps/serverProbe/package.json` — the deps Docker needs.
5. `deploy/pi/bootstrap.sh`, `deploy/pi/systemd/f2a-server-probe.service`, `deploy/pi/.env.example` — current state.
6. `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/project_session_bootstrap.md`.

## Step 2 — Verify PR 3 state + branch

```bash
gh pr list --state open    # check PR 3 (likely #20). Merge if open.
git checkout master && git pull --ff-only origin master
git checkout -b feat/pr4-dockerfile-and-systemd
```

## Step 3 — Ship PR 4

### 3a. `apps/serverProbe/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim

# Xvfb + Chromium runtime libs (Electron deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgbm1 \
    fonts-liberation wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build context expects: pre-built libs (libraries/scraper/build,
# libraries/core/build) and apps/serverProbe/dist + node_modules.
# Use a multi-stage build OR build in CI/locally before docker build.
COPY libraries/core/build ./libraries/core/build
COPY libraries/core/package.json ./libraries/core/package.json
COPY libraries/scraper/build ./libraries/scraper/build
COPY libraries/scraper/package.json ./libraries/scraper/package.json
COPY apps/serverProbe/dist ./apps/serverProbe/dist
COPY apps/serverProbe/package.json ./apps/serverProbe/package.json
COPY apps/serverProbe/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Install only production deps for serverProbe at runtime location
WORKDIR /app/apps/serverProbe
RUN npm install --production --no-package-lock

# Tiny shim so the entrypoint can find the lib
RUN cd /app/apps/serverProbe/node_modules/@first2apply \
  && rm -rf scraper core \
  && ln -s /app/libraries/scraper scraper \
  && ln -s /app/libraries/core core

ENV DISPLAY=:99
EXPOSE 7878
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=300s \
  CMD wget -qO- http://127.0.0.1:7878/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

Note: the lib-symlink approach is one option. Cleaner alternative: make the Dockerfile a **multi-stage** that runs `pnpm install --frozen-lockfile && pnpm -r build` from a clean clone, then copies only the runtime artifacts into the final image. Pick whichever you can get working in the time budget.

### 3b. `apps/serverProbe/entrypoint.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Start Xvfb on :99 in the background
Xvfb :99 -screen 0 1280x720x24 -ac &
XVFB_PID=$!

# Wait for X to be ready (rough: poll xdpyinfo or just sleep)
sleep 1

# --selftest short-circuit: verifies Electron + Xvfb came up, exits 0
if [[ "${1:-}" == "--selftest" ]]; then
  electron --version > /dev/null
  echo "selftest: Xvfb pid=$XVFB_PID, Electron OK"
  kill $XVFB_PID
  exit 0
fi

# Otherwise, exec the real app
exec electron /app/apps/serverProbe/dist/main.js "$@"
```

### 3c. `apps/serverProbe/.dockerignore`

```
node_modules
dist
*.log
**/__tests__
**/*.test.ts
.env*
```

### 3d. Update `deploy/pi/systemd/f2a-server-probe.service`

Per design §4.4. Replace the `ExecStart=/usr/bin/node ...` line with the docker-run form:

```
[Unit]
Description=first2apply server probe (headless, dockerized)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=first2apply
Group=first2apply
WorkingDirectory=/opt/first2apply
EnvironmentFile=/opt/first2apply/.env
# Tolerate stale container if a previous --rm didn't fire
ExecStartPre=-/usr/bin/docker rm -f f2a-server-probe
ExecStart=/usr/bin/docker run --rm --name f2a-server-probe \
          --env-file /opt/first2apply/.env \
          --network host \
          --shm-size=2g \
          --memory=4g \
          --cpus=2.0 \
          ghcr.io/jacobaguon-blip/f2a-server-probe:latest
ExecStop=/usr/bin/docker stop -t 60 f2a-server-probe
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 3e. Update `deploy/pi/bootstrap.sh`

Per design §4.5. Insert NTP check as **Step 1**, before docker check, before user creation, before any mutation:

```bash
# 0. NTP pre-flight (must be Step 1 — quiet hours rely on accurate time)
echo "  [check] NTP synchronized..."
if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" != "yes" ]; then
  echo "  [FAIL] NTP not synchronized. Install chrony or enable systemd-timesyncd before re-running."
  exit 1
fi
echo "  [ok] NTP synchronized"
```

At the end of bootstrap, echo the docker login reminder:

```bash
echo "Next: echo \$PAT | docker login ghcr.io -u <user> --password-stdin"
echo "Then: bash deploy/pi/deploy.sh && systemctl enable f2a-server-probe.service"
```

### 3f. New `deploy/pi/deploy.sh`

```bash
#!/usr/bin/env bash
# deploy.sh — idempotent: tag previous, pull latest, prune cache, restart unit.
set -euo pipefail

IMAGE="ghcr.io/jacobaguon-blip/f2a-server-probe"

# Tag current :latest as :previous (rollback path)
if docker image inspect "${IMAGE}:latest" >/dev/null 2>&1; then
  docker tag "${IMAGE}:latest" "${IMAGE}:previous"
  echo "tagged previous"
fi

# Pull new :latest
docker pull "${IMAGE}:latest"

# Prune dangling images (keeps :previous because it's tagged)
docker image prune -f

# Restart the unit so it picks up the new image
sudo systemctl restart f2a-server-probe.service

echo "deploy complete. journalctl -u f2a-server-probe -f"
```

`chmod +x deploy/pi/deploy.sh` after creating.

### 3g. Wrap `pg_dump.sh` for failure alerting

Per design §4.7. The current `pg_dump.sh` exits non-zero on failure but nothing alerts. Wrap with an inline curl to Pushover when it fails:

```bash
# at the end of pg_dump.sh, before the final `exit 0`:
trap 'on_failure $?' EXIT
on_failure() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "${PUSHOVER_APP_TOKEN:-}" ] && [ -n "${PUSHOVER_USER_KEY:-}" ]; then
    curl -s --form-string "token=$PUSHOVER_APP_TOKEN" \
         --form-string "user=$PUSHOVER_USER_KEY" \
         --form-string "title=f2a pg_dump FAILED" \
         --form-string "message=pg_dump exited with rc=$rc on $(hostname)" \
         https://api.pushover.net/1/messages.json
  fi
}
```

### 3h. Update `deploy/pi/.env.example` + verify
- Already has `F2A_PUSHOVER_MOCK=0` and `TZ=America/Los_Angeles` from the round-2 fixes.
- Verify nothing's missing for what serverProbe actually reads.

### 3i. Local build + Docker build verification

```bash
# Build all the artifacts the Dockerfile expects
cd libraries/core && npm run build && cd ../..
cd libraries/scraper && npm run build && cd ../..
cd apps/serverProbe && npm run build && cd ../..

# Build the image for arm64 (uses QEMU on Mac)
cd /Users/jacobaguon/projects/first2apply
docker buildx build --platform linux/arm64 --load -t f2a-server-probe:test -f apps/serverProbe/Dockerfile .

# Run --selftest in the image
docker run --rm f2a-server-probe:test --selftest
```

If `--selftest` exits 0, the image is healthy.

### 3j. Pi smoke test (requires Pi accessible via `ssh pi`)

```bash
# Save the locally-built image, scp to Pi, load
docker save f2a-server-probe:test | gzip > /tmp/f2a.tar.gz
scp /tmp/f2a.tar.gz pi:/tmp/
ssh pi "gunzip -c /tmp/f2a.tar.gz | docker load && docker tag f2a-server-probe:test ghcr.io/jacobaguon-blip/f2a-server-probe:latest"
ssh pi "docker run --rm --env-file /opt/first2apply/.env --network host --shm-size=2g f2a-server-probe:test --dry-run"
```

If `--dry-run` runs end-to-end against cloud Supabase without writing or notifying — **this is the PR 4 pass condition**.

If Pi isn't reachable: skip the smoke test, mark in the PR description. PR 5 (CI) will validate the Dockerfile builds cleanly.

## Step 4 — Commit, push, PR

```bash
git add -A
git commit -m "feat(deploy): Dockerfile + Pi systemd update + deploy.sh (PR 4 of 5) ..."
git push -u origin feat/pr4-dockerfile-and-systemd
gh pr create --base master --title "feat(deploy): Dockerfile + Pi systemd update (PR 4 of 5)" --body "..."
```

## Step 5 — Log + handoff

1. Append to `decisions.md`: scope adjustments (multi-stage vs symlink, anything that broke during arm64 QEMU build, Pi smoke results).
2. Update memory file.
3. Prompt the user:
   > "PR 4 (#XX) shipped — Dockerfile + systemd unit + deploy.sh. **Clear context and paste `docs/handoff/PR5-prompt.md` to continue with PR 5 (CI).**"

## Acceptance criteria

- [ ] Dockerfile builds clean for `linux/arm64`
- [ ] `docker run f2a-server-probe:test --selftest` exits 0
- [ ] (If Pi reachable) `docker run --dry-run` against cloud completes without prod data writes
- [ ] (If Pi reachable) `f2a-pg-dump.service` runs successfully on manual `systemctl start` trigger
- [ ] Bootstrap NTP check is Step 1
- [ ] deploy.sh is idempotent (run twice, second is a no-op for changes)
- [ ] PR opened, decisions.md + memory updated
