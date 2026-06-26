#!/usr/bin/env bash
# Stop hook: nudge to update CLAUDE.md when key code changed but the cheat sheet didn't.
# Blocks the stop ONCE (escape hatch via stop_hook_active) so it can't loop forever.
set -euo pipefail

input="$(cat)"

# Escape hatch: if we're already continuing because of a prior Stop-hook block,
# don't block again — the agent has had its chance to react.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root"

# Working-tree changes (staged + unstaged), path only.
changed="$(git status --porcelain 2>/dev/null | awk '{print $NF}')" || exit 0
[ -z "$changed" ] && exit 0

# Watched surfaces whose changes should be reflected in CLAUDE.md.
watched_re='^(libraries/scraper/|apps/backend/supabase/functions/|deploy/|scripts/)'

if printf '%s\n' "$changed" | grep -Eq "$watched_re"; then
  if ! printf '%s\n' "$changed" | grep -qx 'CLAUDE.md'; then
    # Exit 2 = blocking error for Stop hooks; stderr is fed back to the model.
    echo "You changed watched code (scraper / edge functions / deploy / scripts) this session but did not update CLAUDE.md. Update the relevant section of CLAUDE.md if a durable structural fact changed (a path, a flow, a gotcha). If no cheat-sheet change is warranted, stop again to proceed." >&2
    exit 2
  fi
fi

exit 0
