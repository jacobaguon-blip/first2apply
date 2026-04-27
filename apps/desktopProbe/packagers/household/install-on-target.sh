#!/bin/bash
# Run ONCE on the target Mac (her MacBook) to install the updater agent.
# Usage:
#   REMOTE="jacob@jacob-mac.local:/Users/jacob/f2a-releases/latest" \
#     bash install-on-target.sh
#
# Assumes this directory (packagers/household/) has already been scp'd over,
# and that ssh from target -> source works without a password (key-based auth).
set -euo pipefail

: "${REMOTE:?Set REMOTE, e.g. user@host:/path/to/latest}"

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.f2a"
PLIST_SRC="$HERE/com.first2apply.updater.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.first2apply.updater.plist"

mkdir -p "$DEST"
cp "$HERE/update.sh" "$DEST/update.sh"
chmod +x "$DEST/update.sh"

cat > "$DEST/config" <<EOF
REMOTE="$REMOTE"
EOF

sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DEST"

launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Installed. First run triggers immediately (RunAtLoad); then hourly."
echo "Logs: $DEST/update.log  /  $DEST/update.err"
