#!/bin/bash
# Runs on YOUR Mac. Pushes the latest staged build to the target machine
# and triggers the remote apply-update.sh over SSH.
#
# Usage:
#   bash deploy-to-her.sh                  # uses ~/.f2a/deploy.config
#   bash deploy-to-her.sh --dry-run        # preflight checks only, no push
#   TARGET="user@host" bash deploy-to-her.sh  # one-off override
#
# Config file (~/.f2a/deploy.config) — shell-style assignments, e.g.:
#   TARGETS=("jacobaguon@jacobs-macbook-pro-2" "jacobaguon@Jacobs-MacBook-Pro-2.local")
#   RELEASE_DIR="$HOME/f2a-releases/latest"
# Multiple TARGETS are tried in order; first one that responds wins.
# This lets you list a Tailscale hostname first (travel-proof) and a .local
# hostname second (LAN fallback) without touching the script.
set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

CONFIG_FILE="$HOME/.f2a/deploy.config"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

# If TARGET wasn't set via env or config, but TARGETS array was, probe each
# in order and pick the first reachable one.
SSH_OPTS=(-o ConnectTimeout=5 -o BatchMode=yes)
if [ -z "${TARGET:-}" ] && [ "${#TARGETS[@]:-0}" -gt 0 ]; then
  for candidate in "${TARGETS[@]}"; do
    echo "Probing $candidate ..."
    if ssh "${SSH_OPTS[@]}" "$candidate" 'echo ok' >/dev/null 2>&1; then
      TARGET="$candidate"
      echo "Selected $TARGET"
      break
    fi
  done
fi

: "${TARGET:?No reachable TARGET. Set TARGET=user@host or populate TARGETS=(...) in $CONFIG_FILE}"

RELEASE_DIR="${RELEASE_DIR:-$HOME/f2a-releases/latest}"
REMOTE_APPLY='$HOME/.f2a/apply-update.sh'
SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes)

if [ ! -f "$RELEASE_DIR/VERSION" ]; then
  echo "No staged build at $RELEASE_DIR — run publish-release.sh first" >&2
  exit 1
fi
if [ ! -d "$RELEASE_DIR/First 2 Apply.app" ]; then
  echo "No First 2 Apply.app at $RELEASE_DIR — staging incomplete" >&2
  exit 1
fi

VERSION=$(cat "$RELEASE_DIR/VERSION")

if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would push $VERSION to $TARGET"
  echo "[dry-run] verifying SSH reachability..."
  if ssh "${SSH_OPTS[@]}" "$TARGET" 'echo ok' >/dev/null 2>&1; then
    echo "[dry-run] SSH ok (key-based, no password fallback)"
  else
    echo "[dry-run] SSH FAILED — key auth not working; would block deploy" >&2
    exit 1
  fi
  echo "[dry-run] verifying remote apply script exists..."
  if ssh "${SSH_OPTS[@]}" "$TARGET" "test -x $REMOTE_APPLY" 2>/dev/null; then
    echo "[dry-run] apply-update.sh present"
  else
    echo "[dry-run] apply-update.sh missing on target — run install-on-target.sh" >&2
    exit 1
  fi
  echo "[dry-run] verifying remote /Applications is writable..."
  if ssh "${SSH_OPTS[@]}" "$TARGET" 'test -w /Applications' 2>/dev/null; then
    echo "[dry-run] /Applications writable"
  else
    echo "[dry-run] WARN: /Applications may need admin write — apply step may fail" >&2
  fi
  echo "[dry-run] all preflight checks passed; deploy would proceed"
  exit 0
fi

echo "Pushing $VERSION to $TARGET ..."

# Atomic-rename pattern: rsync into a tmp dir, then atomically move into place.
# Prevents apply-update.sh from ever seeing a partial transfer.
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ~/f2a-staging.incoming"
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  "$RELEASE_DIR/" "$TARGET:~/f2a-staging.incoming/"

# Atomic swap on the remote (only runs if rsync succeeded due to set -e).
ssh "${SSH_OPTS[@]}" "$TARGET" "rm -rf ~/f2a-staging && mv ~/f2a-staging.incoming ~/f2a-staging"

echo "Triggering apply-update on $TARGET ..."
ssh "${SSH_OPTS[@]}" "$TARGET" "bash $REMOTE_APPLY"

echo "Deployed $VERSION to $TARGET."
