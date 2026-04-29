#!/bin/bash
# Runs on YOUR Mac. Pushes the latest staged build to the target machine
# and triggers the remote apply-update.sh over SSH.
#
# Usage:
#   TARGET="jacobaguon@Jacobs-MacBook-Pro-2.local" \
#     bash deploy-to-her.sh
#   bash deploy-to-her.sh --dry-run
#
# Override RELEASE_DIR if your stage path differs (default: ~/f2a-releases/latest).
set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

: "${TARGET:?Set TARGET, e.g. user@host.local}"

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
