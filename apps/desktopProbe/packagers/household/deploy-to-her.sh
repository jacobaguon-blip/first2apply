#!/bin/bash
# Runs on YOUR Mac. Pushes the latest staged build to the target machine
# and triggers the remote apply-update.sh over SSH.
#
# Usage:
#   TARGET="jacobaguon@Jacobs-MacBook-Pro-2.local" \
#     bash deploy-to-her.sh
#
# Override RELEASE_DIR if your stage path differs (default: ~/f2a-releases/latest).
set -euo pipefail

: "${TARGET:?Set TARGET, e.g. user@host.local}"

RELEASE_DIR="${RELEASE_DIR:-$HOME/f2a-releases/latest}"
REMOTE_STAGING="\$HOME/f2a-staging"
REMOTE_APPLY="\$HOME/.f2a/apply-update.sh"

if [ ! -f "$RELEASE_DIR/VERSION" ]; then
  echo "No staged build at $RELEASE_DIR — run publish-release.sh first" >&2
  exit 1
fi

VERSION=$(cat "$RELEASE_DIR/VERSION")
echo "Pushing $VERSION to $TARGET ..."

# rsync the staged build up
ssh "$TARGET" "mkdir -p ~/f2a-staging"
rsync -az --delete \
  -e "ssh -o ConnectTimeout=10" \
  "$RELEASE_DIR/" "$TARGET:~/f2a-staging/"

# trigger the update on her machine
echo "Triggering apply-update on $TARGET ..."
ssh "$TARGET" "bash $REMOTE_APPLY"

echo "Deployed $VERSION to $TARGET."
