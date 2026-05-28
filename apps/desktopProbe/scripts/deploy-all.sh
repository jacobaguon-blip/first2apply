#!/usr/bin/env bash
# deploy-all.sh — one command from code change to running on both this Mac
# and "her" machine.
#
# Sequence:
#   1. deploy-local.sh                              # build + install + launch on this Mac
#   2. packagers/household/publish-release.sh       # stage build for household
#   3. packagers/household/deploy-to-her.sh         # rsync + remote apply-update.sh
#
# All underlying scripts are idempotent; safe to re-run. Each step exits on
# error and aborts the chain (no partial rollouts past a failed step).
#
# Honors the same env knobs as deploy-local.sh:
#   DEPLOY_LAUNCH=0          # don't launch the local app after install
#   DEPLOY_REFRESH_DEPS=1    # refresh node_modules (no postinstall scripts)
#   DEPLOY_DRY_RUN=1         # preflight only
#
# Skip the household push entirely with DEPLOY_LOCAL_ONLY=1.
#
# Usage (from anywhere):
#   bash apps/desktopProbe/scripts/deploy-all.sh
#   DEPLOY_LOCAL_ONLY=1 bash apps/desktopProbe/scripts/deploy-all.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/.."

LOCAL_ONLY="${DEPLOY_LOCAL_ONLY:-0}"

echo "==> [1/3] local build + install"
bash "$HERE/deploy-local.sh"

if [ "$LOCAL_ONLY" = "1" ]; then
  echo "==> DEPLOY_LOCAL_ONLY=1 → skipping household publish + push"
  exit 0
fi

echo
echo "==> [2/3] household publish (stage to \$RELEASE_DIR)"
bash "$APP_DIR/packagers/household/publish-release.sh"

echo
echo "==> [3/3] household push (rsync + remote apply-update.sh)"
bash "$APP_DIR/packagers/household/deploy-to-her.sh"

echo
echo "==> deploy-all done."
