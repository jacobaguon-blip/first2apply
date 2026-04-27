#!/usr/bin/env bash
# restore.sh — restore newest pg_dump into the local standby Postgres.
# SAFETY: defaults to dry-run. Set F2A_PI_APPLY=1 to actually run mutations.
# DESTRUCTIVE in apply mode: drops + recreates the target DB.
set -euo pipefail

APPLY="${F2A_PI_APPLY:-0}"
SRC_DIR="${F2A_BACKUP_DIR:-/var/backups/supabase}"
TARGET_URL="${F2A_STANDBY_URL:-postgres://postgres:postgres@127.0.0.1:54322/postgres}"

run() {
  if [ "$APPLY" = "1" ]; then
    echo "[APPLY] $*"; eval "$@"
  else
    echo "[DRY] would: $*"
  fi
}

LATEST="$(ls -1t "$SRC_DIR"/*.sql.gz 2>/dev/null | head -n1 || true)"
if [ -z "$LATEST" ]; then
  echo "ERROR: no dump files in $SRC_DIR"; exit 2
fi

echo "Latest dump: $LATEST"
run "gunzip -c '$LATEST' | psql '$TARGET_URL'"

echo "===== restore complete (apply=$APPLY) ====="
