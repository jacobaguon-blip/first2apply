#!/bin/bash
# Runs on the TARGET Mac (her machine). Invoked over SSH by deploy-to-her.sh
# after a fresh build is rsync'd into ~/f2a-staging/. Compares versions and
# swaps the app in /Applications if newer.
set -euo pipefail

STAGING="$HOME/f2a-staging"
APP="/Applications/First 2 Apply.app"
APP_NAME="First 2 Apply"

if [ ! -f "$STAGING/VERSION" ]; then
  echo "No VERSION file in $STAGING; nothing to apply" >&2
  exit 1
fi

REMOTE_VER=$(cat "$STAGING/VERSION")
if [ -d "$APP" ]; then
  LOCAL_VER=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "0")
else
  LOCAL_VER="0"
fi

if [ "$REMOTE_VER" = "$LOCAL_VER" ]; then
  echo "Already on $LOCAL_VER; nothing to do."
  exit 0
fi

echo "Updating $APP_NAME: $LOCAL_VER -> $REMOTE_VER"

osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
sleep 4
pkill -f "$APP_NAME" >/dev/null 2>&1 || true
sleep 1

rm -rf "$APP"
cp -R "$STAGING/$APP_NAME.app" "$APP"

# Strip quarantine + ad-hoc sign so Gatekeeper lets it launch on subsequent
# macOS versions without a paid Developer ID.
xattr -dr com.apple.quarantine "$APP" || true
codesign --force --deep --sign - "$APP" || true

open -a "$APP_NAME"
echo "Update complete."
