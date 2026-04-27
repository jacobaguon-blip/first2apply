#!/bin/bash
# Kill any running electron-forge dev session for this app.
# The installed /Applications copy and the dev copy share a user-data-dir,
# so leaving dev running makes the installed app silently fail to launch.
set -euo pipefail

pkill -f 'electron-forge start' || true
pkill -f 'first2apply/node_modules/electron/dist/Electron' || true
pkill -f 'fork-ts-checker-webpack-plugin' || true

sleep 1

if pgrep -f 'first2apply/node_modules/electron/dist/Electron' >/dev/null; then
  echo "Dev Electron still running after SIGTERM; sending SIGKILL" >&2
  pkill -9 -f 'first2apply/node_modules/electron/dist/Electron' || true
fi

echo "Dev processes cleared."
