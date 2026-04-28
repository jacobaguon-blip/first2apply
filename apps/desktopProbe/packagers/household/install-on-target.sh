#!/bin/bash
# Run ONCE on the target Mac (her MacBook) to install the apply-update script.
# Push model: deploy-to-her.sh on YOUR Mac rsyncs builds to ~/f2a-staging/
# and invokes ~/.f2a/apply-update.sh over SSH.
#
# Usage:
#   bash install-on-target.sh
#
# Assumes this directory (packagers/household/) has already been scp'd over.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.f2a"

mkdir -p "$DEST"
cp "$HERE/apply-update.sh" "$DEST/apply-update.sh"
chmod +x "$DEST/apply-update.sh"

echo "Installed $DEST/apply-update.sh"
echo "From your Mac, run:"
echo "  TARGET=\"$USER@\$(hostname).local\" bash deploy-to-her.sh"
