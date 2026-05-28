#!/usr/bin/env bash
# deploy-local.sh — build the desktop app for THIS Mac (darwin-arm64) and
# install it to /Applications/, replacing any previous build. One command
# from a fresh code change to a running new app.
#
# Security posture:
#   • Uses pnpm (NOT npm). `npm` is intentionally not on PATH on this Mac.
#   • Verifies the installed pnpm is on PATH and refuses to fall back to npm.
#   • Optional `DEPLOY_REFRESH_DEPS=1` runs pnpm install with
#     `--ignore-scripts --frozen-lockfile --prefer-offline` so no postinstall
#     scripts in any dep can execute (closes the dominant npm-ecosystem
#     supply-chain vector), and the lockfile must match exactly.
#   • Scrubs PUSHOVER_USER_KEY from .env during the build so a personal key
#     is never baked into the distributable (same pattern as publish-release).
#   • Restores .env on exit even if the build crashes (trap).
#   • Atomic swap into /Applications/ with a .previous.app rollback path.
#
# Usage (from repo root or anywhere):
#   bash apps/desktopProbe/scripts/deploy-local.sh
#   DEPLOY_LAUNCH=0       bash apps/desktopProbe/scripts/deploy-local.sh   # build+install, no launch
#   DEPLOY_REFRESH_DEPS=1 bash apps/desktopProbe/scripts/deploy-local.sh   # refresh node_modules from lockfile (no scripts)
#   DEPLOY_DRY_RUN=1      bash apps/desktopProbe/scripts/deploy-local.sh   # preflight only
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/.."                          # apps/desktopProbe
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
APP_NAME="First 2 Apply"
INSTALL_PATH="/Applications/${APP_NAME}.app"
BACKUP_PATH="/Applications/${APP_NAME}.previous.app"

DRY_RUN="${DEPLOY_DRY_RUN:-0}"
DO_LAUNCH="${DEPLOY_LAUNCH:-1}"
REFRESH_DEPS="${DEPLOY_REFRESH_DEPS:-0}"

cd "$APP_DIR"
VERSION=$(node -p "require('./package.json').version")

echo "==> Local desktop deploy: ${APP_NAME} ${VERSION}"
echo "    APP_DIR=${APP_DIR}"
echo "    INSTALL_PATH=${INSTALL_PATH}"
echo "    DEPLOY_LAUNCH=${DO_LAUNCH}  DEPLOY_REFRESH_DEPS=${REFRESH_DEPS}  DEPLOY_DRY_RUN=${DRY_RUN}"

# ─── 1. Pre-flight ─────────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "FATAL: this script targets darwin-arm64 only (got $(uname -s)-$(uname -m))." >&2
  exit 1
fi

# Hard refuse to run if pnpm is missing. We intentionally do NOT fall back to
# npm — npm is not on this machine and the deploy must not silently re-install
# it via a "helpful" auto-recovery path.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "FATAL: pnpm not on PATH. This deploy refuses to fall back to npm." >&2
  echo "       Install pnpm via 'corepack enable && corepack prepare pnpm@latest --activate' or Homebrew." >&2
  exit 1
fi

# Belt + suspenders: if npm IS on PATH, warn loudly. Doesn't block (user can
# choose), but makes the unexpected reappearance noisy.
if command -v npm >/dev/null 2>&1; then
  echo "WARNING: npm is on PATH at $(command -v npm). This deploy uses pnpm exclusively, but" >&2
  echo "         npm's presence suggests something reinstalled it. Investigate before shipping." >&2
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] preflight ok — would (refresh_deps=${REFRESH_DEPS}) + build + install + (launch=${DO_LAUNCH})"
  exit 0
fi

# ─── 2. Kill anything holding the app files ────────────────────────────────
bash "$APP_DIR/scripts/kill-dev.sh" || true
osascript -e "tell application \"${APP_NAME}\" to quit" 2>/dev/null || true
sleep 1
pkill -f "/Applications/${APP_NAME}.app/Contents/MacOS/" 2>/dev/null || true

# ─── 3. PUSHOVER_USER_KEY scrub (mirrors publish-release.sh) ───────────────
ENV_FILE="$APP_DIR/.env"
ENV_BACKUP="$APP_DIR/.env.deploy-local-backup"

if [ -f "$ENV_BACKUP" ]; then
  echo "    found stale .env backup from a previous crashed run — restoring."
  mv "$ENV_BACKUP" "$ENV_FILE"
fi

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  trap 'mv "$ENV_BACKUP" "$ENV_FILE" 2>/dev/null || true' EXIT
  sed -i '' -E "s/^PUSHOVER_USER_KEY=([\"']?)[^\"']*([\"']?)$/PUSHOVER_USER_KEY=/" "$ENV_FILE"
  if grep -q "^PUSHOVER_USER_KEY=." "$ENV_FILE"; then
    echo "ERROR: PUSHOVER_USER_KEY scrub failed — refusing to ship a build with personal key baked in" >&2
    exit 1
  fi
fi

# ─── 4. (Optional) Refresh deps from lockfile, with no postinstall scripts ─
if [ "$REFRESH_DEPS" = "1" ]; then
  echo "==> pnpm install --ignore-scripts --frozen-lockfile --prefer-offline"
  cd "$REPO_ROOT"
  pnpm install \
    --ignore-scripts \
    --frozen-lockfile \
    --prefer-offline \
    --filter "first2apply-desktop..." \
    --filter "@first2apply/core..." \
    --filter "@first2apply/scraper..." \
    --filter "@first2apply/ui..."
  cd "$APP_DIR"
fi

# ─── 5. Build ──────────────────────────────────────────────────────────────
# `pnpm package` (electron-forge package) produces the .app bundle — exactly
# what we need to install locally. We intentionally avoid `pnpm make` here
# because `make` invokes the DMG maker which pulls in `macos-alias`, a native
# module that fails to compile on Node v26+. The household publish path
# (packagers/household/publish-release.sh) still uses `pnpm make` because the
# DMG is the distributable format for the remote install — for local install
# we just need the .app.
echo "==> pnpm package (electron-forge package --arch=arm64)"
pnpm package --arch=arm64

BUILT="out/${APP_NAME}-darwin-arm64/${APP_NAME}.app"
if [ ! -d "$BUILT" ]; then
  echo "FATAL: build output not found at $BUILT" >&2
  exit 1
fi

# ─── 6. Install (atomic swap with rollback path) ───────────────────────────
echo "==> installing to ${INSTALL_PATH}"
rm -rf "$BACKUP_PATH"
if [ -d "$INSTALL_PATH" ]; then
  mv "$INSTALL_PATH" "$BACKUP_PATH"
fi
cp -R "$BUILT" "$INSTALL_PATH"
xattr -dr com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true

INSTALLED_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INSTALL_PATH/Contents/Info.plist" 2>/dev/null || echo "?")
echo "    installed: ${APP_NAME} ${INSTALLED_VERSION}"

# ─── 7. Launch ─────────────────────────────────────────────────────────────
if [ "$DO_LAUNCH" = "1" ]; then
  echo "==> launching ${APP_NAME}"
  open -a "${INSTALL_PATH}" || open "${INSTALL_PATH}"
fi

echo "==> done. (Previous build retained at ${BACKUP_PATH} for rollback)"
