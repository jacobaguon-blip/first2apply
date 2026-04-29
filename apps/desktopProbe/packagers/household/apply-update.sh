#!/bin/bash
# Runs on the TARGET Mac (her machine). Invoked over SSH by deploy-to-her.sh
# after a fresh build is rsync'd into ~/f2a-staging/. Compares versions,
# backs up the current install, swaps the bundle, and relaunches via
# launchctl asuser so it actually runs in her GUI session.
set -euo pipefail

STAGING="$HOME/f2a-staging"
APP="/Applications/First 2 Apply.app"
APP_NAME="First 2 Apply"
BACKUP_DIR="$HOME/.f2a/last-known-good"
LOG_FILE="$HOME/.f2a/deploy.log"
mkdir -p "$HOME/.f2a"

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"
}

if [ ! -f "$STAGING/VERSION" ]; then
  log "ERROR: No VERSION file in $STAGING; nothing to apply"
  exit 1
fi
if [ ! -d "$STAGING/$APP_NAME.app" ]; then
  log "ERROR: No $APP_NAME.app in $STAGING; staging incomplete"
  exit 1
fi

REMOTE_VER=$(cat "$STAGING/VERSION")
if [ -d "$APP" ]; then
  LOCAL_VER=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "0")
else
  LOCAL_VER="0"
fi

if [ "$REMOTE_VER" = "$LOCAL_VER" ]; then
  log "Already on $LOCAL_VER; nothing to do."
  exit 0
fi

log "Updating $APP_NAME: $LOCAL_VER -> $REMOTE_VER"

# Quit the running app so we can replace its bundle.
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
sleep 4
pkill -f "$APP_NAME" >/dev/null 2>&1 || true
sleep 1

# Backup current bundle for rollback (only if one exists).
if [ -d "$APP" ]; then
  rm -rf "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -R "$APP" "$BACKUP_DIR/$APP_NAME.app"
  echo "$LOCAL_VER" > "$BACKUP_DIR/VERSION"
  log "Backed up $LOCAL_VER to $BACKUP_DIR"
fi

rm -rf "$APP"
if ! cp -R "$STAGING/$APP_NAME.app" "$APP"; then
  log "ERROR: cp failed during install — attempting rollback from $BACKUP_DIR"
  if [ -d "$BACKUP_DIR/$APP_NAME.app" ]; then
    rm -rf "$APP"
    cp -R "$BACKUP_DIR/$APP_NAME.app" "$APP" || log "ERROR: rollback also failed; manual recovery needed"
    log "Rolled back to $LOCAL_VER"
    exit 1
  else
    log "ERROR: no backup available; manual recovery needed"
    exit 1
  fi
fi

# Strip quarantine + ad-hoc sign so Gatekeeper lets it launch on subsequent
# macOS versions without a paid Developer ID.
xattr -dr com.apple.quarantine "$APP" || true
codesign --force --deep --sign - "$APP" || true

# Relaunch via launchctl asuser so the app opens in the active GUI session
# (over SSH there's no Aqua launch context, so plain `open -a` fails).
GUI_USER=$(stat -f "%u" /dev/console 2>/dev/null || id -u)
if launchctl asuser "$GUI_USER" open -a "$APP_NAME" 2>/dev/null; then
  log "Relaunched via launchctl asuser (uid $GUI_USER)"
else
  open -a "$APP_NAME" 2>/dev/null || true
  log "Relaunch attempted; if app didn't appear, click it from Dock manually"
fi

log "Update complete: now on $REMOTE_VER"
