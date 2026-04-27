#!/usr/bin/env bash
# bootstrap.sh — idempotent Pi bootstrap for first2apply.
# SAFETY: defaults to dry-run. Set F2A_PI_APPLY=1 to actually run mutations.
# Spec: spec.md §5 Item 4 + §9.1.
set -euo pipefail

APPLY="${F2A_PI_APPLY:-0}"
NS="/opt/first2apply"
SVC_USER="${F2A_PI_USER:-first2apply}"

run() {
  if [ "$APPLY" = "1" ]; then
    echo "[APPLY] $*"
    eval "$@"
  else
    echo "[DRY] would: $*"
  fi
}

echo "===== first2apply bootstrap ====="
echo "  apply mode : ${APPLY}  (set F2A_PI_APPLY=1 to mutate)"
echo "  namespace  : ${NS}"
echo "  svc user   : ${SVC_USER}"

# 1. Docker presence (idempotent check, no install on this run)
if command -v docker >/dev/null 2>&1; then
  echo "  [ok] docker $(docker --version)"
else
  echo "  [FAIL] docker not installed; install via apt before continuing"
  exit 1
fi

# 2. Service user
if id "$SVC_USER" >/dev/null 2>&1; then
  echo "  [ok] user '$SVC_USER' exists"
else
  run "sudo useradd --system --create-home --shell /bin/bash --groups docker '$SVC_USER'"
fi

# 3. Namespace dir
run "sudo mkdir -p '$NS' '$NS/builds' '$NS/data' '$NS/logs'"
run "sudo chown -R '$SVC_USER':'$SVC_USER' '$NS'"

# 4. .env.example (NO real secrets are written by this script)
ENV_EXAMPLE_SRC="$(dirname "$0")/.env.example"
if [ -f "$ENV_EXAMPLE_SRC" ]; then
  run "sudo install -m 0644 -o '$SVC_USER' -g '$SVC_USER' '$ENV_EXAMPLE_SRC' '$NS/.env.example'"
fi

# 5. systemd units (copied but NOT enabled — go-live is gated to a separate script)
SYSTEMD_SRC="$(dirname "$0")/systemd"
if [ -d "$SYSTEMD_SRC" ]; then
  for unit in "$SYSTEMD_SRC"/*.service "$SYSTEMD_SRC"/*.timer; do
    [ -e "$unit" ] || continue
    run "sudo install -m 0644 '$unit' '/etc/systemd/system/$(basename "$unit")'"
  done
  run "sudo systemctl daemon-reload"
fi

# 6. compose.standby.yaml (copied, profile keeps it OFF)
COMPOSE_SRC="$(dirname "$0")/compose.standby.yaml"
if [ -f "$COMPOSE_SRC" ]; then
  run "sudo install -m 0644 -o '$SVC_USER' -g '$SVC_USER' '$COMPOSE_SRC' '$NS/compose.standby.yaml'"
fi

echo "===== bootstrap complete (apply=$APPLY) ====="
echo "Next: review $NS, then run deploy/pi/go-live.sh to enable services."
