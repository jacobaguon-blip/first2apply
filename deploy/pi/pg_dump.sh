#!/usr/bin/env bash
# pg_dump.sh — nightly pg_dump of cloud Supabase to local backups dir.
# SAFETY: defaults to dry-run. Set F2A_PI_APPLY=1 to actually run mutations.
# Reads connection string from /opt/first2apply/.env (PG_DUMP_URL=).
# Retention: 7 days.
set -euo pipefail

APPLY="${F2A_PI_APPLY:-0}"
ENV_FILE="${F2A_ENV_FILE:-/opt/first2apply/.env}"
DEST_DIR="${F2A_BACKUP_DIR:-/var/backups/supabase}"
RETAIN_DAYS=7

# Pushover failure alert. Reads PUSHOVER_{APP_TOKEN,USER_KEY} from env (sourced
# below from $ENV_FILE). Silent no-op if either is unset, so a fresh box without
# Pushover wired up still surfaces failures via systemd / journalctl.
on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "${PUSHOVER_APP_TOKEN:-}" ] && [ -n "${PUSHOVER_USER_KEY:-}" ] \
     && [ "${F2A_PUSHOVER_MOCK:-0}" != "1" ]; then
    curl -s --max-time 10 \
      --form-string "token=$PUSHOVER_APP_TOKEN" \
      --form-string "user=$PUSHOVER_USER_KEY" \
      --form-string "title=f2a pg_dump FAILED" \
      --form-string "message=pg_dump exited rc=$rc on $(hostname) at $(date -u +%FT%TZ)" \
      https://api.pushover.net/1/messages.json >/dev/null || true
  fi
  exit "$rc"
}
trap on_exit EXIT

run() {
  if [ "$APPLY" = "1" ]; then
    echo "[APPLY] $*"; eval "$@"
  else
    echo "[DRY] would: $*"
  fi
}

if [ "$APPLY" = "1" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found"; exit 2
  fi
  # shellcheck disable=SC1090
  set +u; source "$ENV_FILE"; set -u
  if [ -z "${PG_DUMP_URL:-}" ]; then
    echo "ERROR: PG_DUMP_URL not set in $ENV_FILE"; exit 2
  fi
fi

DATE_STR="$(date -u +%Y-%m-%d)"
OUT="$DEST_DIR/$DATE_STR.sql.gz"

run "mkdir -p '$DEST_DIR'"
run "pg_dump --no-owner --no-acl \"\$PG_DUMP_URL\" | gzip -9 > '$OUT'"
run "chmod 0600 '$OUT'"

# Retention prune
run "find '$DEST_DIR' -type f -name '*.sql.gz' -mtime +$RETAIN_DAYS -delete"

echo "===== pg_dump complete (apply=$APPLY, file=$OUT) ====="
