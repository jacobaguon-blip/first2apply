#!/usr/bin/env bash
# Container entrypoint for serverProbe. Starts Xvfb, then execs Electron.
set -euo pipefail

Xvfb :99 -screen 0 1280x720x24 -ac &
XVFB_PID=$!

# Tear Xvfb down on exit so docker stop is clean.
trap 'kill -TERM "$XVFB_PID" 2>/dev/null || true; wait "$XVFB_PID" 2>/dev/null || true' EXIT TERM INT

# Wait for X socket to appear (typically <100ms). Cheaper than installing
# x11-utils just for xdpyinfo.
for _ in $(seq 1 50); do
  if [ -S /tmp/.X11-unix/X99 ]; then break; fi
  sleep 0.1
done

# All flags (--selftest, --dry-run, --scan-once) are handled inside main.ts;
# we just forward argv so a single code path defines behavior.
cd /app/apps/serverProbe
# --no-sandbox must be a real CLI flag, not just app.commandLine.appendSwitch:
# Electron's "running as root" check fires BEFORE the JS bundle loads, so the
# in-process switch is too late. Container runs as root by default.
exec electron --no-sandbox dist/main.js "$@"
