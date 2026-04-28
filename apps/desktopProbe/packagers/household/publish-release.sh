#!/bin/bash
# Run on YOUR Mac after bumping version in apps/desktopProbe/package.json.
# Builds the arm64 app and stages it in the release dir that the target
# machine rsyncs from.
#
#   RELEASE_DIR=~/f2a-releases/latest bash publish-release.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HERE/../.."                      # apps/desktopProbe
RELEASE_DIR="${RELEASE_DIR:-$HOME/f2a-releases/latest}"
APP_NAME="First 2 Apply"

cd "$APP_DIR"
VERSION=$(node -p "require('./package.json').version")

# Kill any dev session before building — otherwise the dev Electron holds the
# user-data-dir and the freshly-installed .app fails to launch.
bash "$APP_DIR/scripts/kill-dev.sh"

# Blank PUSHOVER_USER_KEY for the duration of the build so the dev's personal
# pushover key doesn't get baked into a multi-user build. Each user enters
# their own key in the in-app Settings; this is just a build-time fallback.
# trap ensures restore runs even if the build crashes.
ENV_FILE="$APP_DIR/.env"
ENV_BACKUP="$APP_DIR/.env.publish-backup"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  trap 'mv "$ENV_BACKUP" "$ENV_FILE" 2>/dev/null || true' EXIT
  sed -i '' 's/^PUSHOVER_USER_KEY=.*/PUSHOVER_USER_KEY=/' "$ENV_FILE"
fi

echo "Building $APP_NAME $VERSION (arm64)..."
pnpm make

BUILT="out/$APP_NAME-darwin-arm64/$APP_NAME.app"
if [ ! -d "$BUILT" ]; then
  echo "Build output not found at $BUILT" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
rm -rf "$RELEASE_DIR/$APP_NAME.app"
cp -R "$BUILT" "$RELEASE_DIR/$APP_NAME.app"
echo "$VERSION" > "$RELEASE_DIR/VERSION"

echo "Staged $VERSION at $RELEASE_DIR"
