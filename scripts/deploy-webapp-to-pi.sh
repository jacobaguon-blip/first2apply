#!/usr/bin/env bash
# deploy-webapp-to-pi.sh — build apps/webapp standalone and rsync to the Pi.
#
# Preflight aborts loudly on:
#   - dirty apps/webapp working tree (prevents shipping uncommitted code)
#   - SSH target unreachable / requires password
#   - /opt/first2apply/.env missing SUPABASE_URL / SUPABASE_ANON_KEY
#
# Post-deploy smoke verifies:
#   - 200 on /, /sw.js, /manifest.webmanifest, /offline, /sw-reset
#   - /sw.js body contains the stable literal "sw-activated" (proves it is the
#     compiled service worker, not an HTML redirect or error page)
#
# Override the target with:  PI_SSH_TARGET=user@host ./scripts/deploy-webapp-to-pi.sh
#
# Requires NOPASSWD sudo for systemctl on the Pi. See apps/webapp/README.md.

set -euo pipefail

PI_SSH_TARGET="${PI_SSH_TARGET:-maadkal@100.93.137.31}"
PI_BUILD_DIR="${PI_BUILD_DIR:-/opt/first2apply/builds/web-ui}"
PI_ENV_FILE="${PI_ENV_FILE:-/opt/first2apply/.env}"
SERVICE_NAME="${SERVICE_NAME:-f2a-web-ui.service}"
SMOKE_URL="${SMOKE_URL:-http://127.0.0.1:3030}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBAPP_DIR="${REPO_ROOT}/apps/webapp"

SSH_OPTS=(-o BatchMode=yes -o PasswordAuthentication=no -o ConnectTimeout=10)

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

log "Target: ${PI_SSH_TARGET}  Build dir: ${PI_BUILD_DIR}"

# ── Preflight ────────────────────────────────────────────────────────────────

log "Preflight 1/3 — working tree clean for apps/webapp"
if ! git -C "${REPO_ROOT}" diff --quiet -- apps/webapp; then
  git -C "${REPO_ROOT}" status --short -- apps/webapp >&2
  fail "apps/webapp has uncommitted changes. Commit or stash before deploying."
fi
if ! git -C "${REPO_ROOT}" diff --quiet --cached -- apps/webapp; then
  fail "apps/webapp has staged-but-uncommitted changes. Commit before deploying."
fi
GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
log "  HEAD: ${GIT_SHA}"

log "Preflight 2/3 — SSH reachability (BatchMode, no password prompt)"
if ! ssh "${SSH_OPTS[@]}" "${PI_SSH_TARGET}" 'true' 2>/dev/null; then
  fail "Cannot SSH to ${PI_SSH_TARGET} without a password. Fix: add your public key to ~/.ssh/authorized_keys on the Pi, or set PI_SSH_TARGET=<user>@<host>."
fi

log "Preflight 3/3 — Supabase env on Pi"
if ! ssh "${SSH_OPTS[@]}" "${PI_SSH_TARGET}" "grep -qE '^SUPABASE_URL=.+' ${PI_ENV_FILE} && grep -qE '^SUPABASE_ANON_KEY=.+' ${PI_ENV_FILE}" 2>/dev/null; then
  fail "${PI_ENV_FILE} on the Pi is missing SUPABASE_URL or SUPABASE_ANON_KEY (or is unreadable). Aborting before a silent broken-login deploy."
fi

# ── Build ────────────────────────────────────────────────────────────────────

log "Building standalone bundle"
( cd "${REPO_ROOT}" && SERWIST_SUPPRESS_TURBOPACK_WARNING=1 pnpm --filter @first2apply/webapp build:standalone >/dev/null )

if [ ! -f "${WEBAPP_DIR}/.next/standalone/apps/webapp/server.js" ]; then
  fail "Standalone bundle missing apps/webapp/server.js. Did next.config.ts lose output:'standalone'?"
fi

# ── Rsync ────────────────────────────────────────────────────────────────────

log "Rsync standalone tree → ${PI_SSH_TARGET}:${PI_BUILD_DIR}/"
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  "${WEBAPP_DIR}/.next/standalone/" \
  "${PI_SSH_TARGET}:${PI_BUILD_DIR}/"

# ── Restart ──────────────────────────────────────────────────────────────────

log "Restart ${SERVICE_NAME} (requires NOPASSWD sudo)"
ssh "${SSH_OPTS[@]}" "${PI_SSH_TARGET}" "sudo /bin/systemctl restart ${SERVICE_NAME}"

# ── Deep smoke ───────────────────────────────────────────────────────────────

log "Smoke (from the Pi, against ${SMOKE_URL})"
SMOKE_SCRIPT=$(cat <<'EOSMOKE'
set -euo pipefail
URL="$1"
# Wait up to 10s for the new server to start accepting connections.
for i in $(seq 1 20); do
  if curl -s -o /dev/null --max-time 1 "${URL}/" 2>/dev/null; then break; fi
  sleep 0.5
done
fail=0
for p in / /sw.js /manifest.webmanifest /offline /sw-reset; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${URL}${p}" || echo 000)
  printf '  %-25s -> %s\n' "${p}" "${code}"
  if [ "${code}" != "200" ]; then fail=1; fi
done
if ! curl -fsS "${URL}/sw.js" | grep -q 'sw-activated'; then
  echo '  /sw.js body missing "sw-activated" literal — not the real SW!' >&2
  fail=1
fi
exit "${fail}"
EOSMOKE
)

if ! ssh "${SSH_OPTS[@]}" "${PI_SSH_TARGET}" "bash -s -- '${SMOKE_URL}'" <<< "${SMOKE_SCRIPT}"; then
  fail "Smoke failed. Service is running but PWA assets are not serving correctly."
fi

log "Deploy complete. SHA ${GIT_SHA} live on ${PI_SSH_TARGET}."
log "Tail logs:  ssh ${PI_SSH_TARGET} 'journalctl -u ${SERVICE_NAME} -f'"
