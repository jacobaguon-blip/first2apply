#!/usr/bin/env bash
# go-live.sh — enable + start f2a-* systemd units. NEVER run unattended.
# SAFETY: defaults to dry-run. Set F2A_PI_APPLY=1 to actually run mutations.
set -euo pipefail

APPLY="${F2A_PI_APPLY:-0}"

run() {
  if [ "$APPLY" = "1" ]; then
    echo "[APPLY] $*"; eval "$@"
  else
    echo "[DRY] would: $*"
  fi
}

UNITS=(
  "f2a-server-probe.service"
  "f2a-web-ui.service"
  "f2a-pg-dump.timer"
)

for u in "${UNITS[@]}"; do
  if [ -f "/etc/systemd/system/$u" ]; then
    run "sudo systemctl enable '$u'"
    run "sudo systemctl start  '$u'"
  else
    echo "  [skip] $u not installed (run bootstrap.sh first)"
  fi
done

echo "===== go-live complete (apply=$APPLY) ====="
