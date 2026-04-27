#!/bin/bash
# Pulls the latest First 2 Apply build from REMOTE and installs it if the
# version changed. Invoked on a timer by the launchd agent.
set -euo pipefail

# ---- config -----------------------------------------------------------------
# Override by creating ~/.f2a/config with shell-style assignments, e.g.:
#   REMOTE="jacob@jacob-mac.local:/Users/jacob/f2a-releases/latest"
REMOTE="${REMOTE:-}"
LOCAL="$HOME/.f2a"
APP="/Applications/First 2 Apply.app"
APP_NAME="First 2 Apply"

[ -f "$LOCAL/config" ] && source "$LOCAL/config"

if [ -z "$REMOTE" ]; then
  echo "REMOTE not set; create $LOCAL/config with REMOTE=user@host:/path/to/latest" >&2
  exit 1
fi

mkdir -p "$LOCAL/staging"

# ---- pull -------------------------------------------------------------------
# -e with BatchMode=yes so launchd never hangs on a password prompt.
rsync -az --delete \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
  "$REMOTE/" "$LOCAL/staging/"

if [ ! -f "$LOCAL/staging/VERSION" ]; then
  echo "No VERSION file in staging; aborting" >&2
  exit 1
fi

REMOTE_VER=$(cat "$LOCAL/staging/VERSION")
if [ -d "$APP" ]; then
  LOCAL_VER=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "0")
else
  LOCAL_VER="0"
fi

if [ "$REMOTE_VER" = "$LOCAL_VER" ]; then
  exit 0
fi

echo "Updating $APP_NAME: $LOCAL_VER -> $REMOTE_VER"

# ---- swap -------------------------------------------------------------------
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
sleep 4
pkill -f "$APP_NAME" >/dev/null 2>&1 || true
sleep 1

rm -rf "$APP"
cp -R "$LOCAL/staging/$APP_NAME.app" "$APP"

# Strip quarantine and apply an ad-hoc signature so Gatekeeper lets it launch
# on subsequent macOS versions without a paid Developer ID.
xattr -dr com.apple.quarantine "$APP" || true
codesign --force --deep --sign - "$APP" || true

open -a "$APP_NAME"
echo "Update complete."
