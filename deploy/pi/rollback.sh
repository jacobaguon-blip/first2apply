#!/usr/bin/env bash
# rollback.sh — undo every f2a-* mutation on the Pi.
# SAFETY: defaults to dry-run. Set F2A_PI_APPLY=1 to actually run mutations.
# Idempotent. Run via: ssh pi "F2A_PI_APPLY=1 bash -s" < deploy/pi/rollback.sh
set -euo pipefail

APPLY="${F2A_PI_APPLY:-0}"
PI_USER="${F2A_PI_USER:-first2apply}"
NS="/opt/first2apply"
SYSTEMD_PATTERN="f2a-*"
DOCKER_PATTERN="f2a-"

run() {
  if [ "$APPLY" = "1" ]; then
    echo "[APPLY] $*"
    eval "$@"
  else
    echo "[DRY] would: $*"
  fi
}

echo "== first2apply Pi rollback =="
echo "APPLY=$APPLY (set F2A_PI_APPLY=1 to mutate)"
echo "Namespace: $NS"
echo "Systemd pattern: $SYSTEMD_PATTERN"
echo "Docker container pattern: ${DOCKER_PATTERN}*"
echo

# 1. Stop & disable any f2a-* systemd units (services + timers).
echo "-- step 1: systemd units --"
UNITS="$(systemctl list-unit-files "${SYSTEMD_PATTERN}" --no-legend 2>/dev/null | awk '{print $1}' || true)"
if [ -z "$UNITS" ]; then
  echo "  (no f2a-* units found)"
else
  for u in $UNITS; do
    run "sudo systemctl disable --now '$u' || true"
    run "sudo rm -f /etc/systemd/system/$u"
  done
  run "sudo systemctl daemon-reload"
fi

# 2. Stop and remove any f2a-* docker containers.
echo "-- step 2: docker containers --"
if command -v docker >/dev/null 2>&1; then
  CONTAINERS="$(docker ps -a --filter "name=${DOCKER_PATTERN}" --format '{{.Names}}' || true)"
  if [ -z "$CONTAINERS" ]; then
    echo "  (no f2a-* containers)"
  else
    for c in $CONTAINERS; do
      run "docker stop '$c' || true"
      run "docker rm   '$c' || true"
    done
  fi
else
  echo "  (docker not installed)"
fi

# 3. Remove namespace dir.
echo "-- step 3: namespace dir --"
if [ -d "$NS" ]; then
  run "sudo rm -rf '$NS'"
else
  echo "  ($NS does not exist)"
fi

# 4. Remove staged build artifacts in maadkal home.
echo "-- step 4: build staging --"
STAGE="/home/maadkal/f2a-builds"
if [ -d "$STAGE" ]; then
  run "rm -rf '$STAGE'"
else
  echo "  ($STAGE does not exist)"
fi

# 5. Optionally remove the dedicated user (only if it exists and APPLY=1).
echo "-- step 5: dedicated user --"
if id -u "$PI_USER" >/dev/null 2>&1; then
  run "sudo userdel -r '$PI_USER' || true"
else
  echo "  ($PI_USER does not exist)"
fi

echo
echo "== rollback complete (apply=$APPLY) =="
