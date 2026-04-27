#!/usr/bin/env bash
# weekend-dry-run.sh — gate verification per spec.md §6 + §9.
# Each step is gated: missing artifacts -> SKIP, not failure.
# Pass: every NON-skipped step exits 0.
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DRY_RUN_FLAG="${1:-}"

# Force mocks for safety.
export F2A_AI_MOCK=1
export F2A_MOCK_SCRAPE=1
export F2A_PUSHOVER_MOCK=1
unset F2A_PI_APPLY  # never apply pi mutations from dry-run

PASS=0; FAIL=0; SKIP=0
declare -a FAIL_STEPS=()
declare -a SKIP_STEPS=()

step() {
  local name="$1"; shift
  echo
  echo "===== STEP: $name ====="
  if "$@"; then
    echo "  -> PASS: $name"
    PASS=$((PASS+1))
  else
    local rc=$?
    echo "  -> FAIL: $name (exit=$rc)"
    FAIL=$((FAIL+1))
    FAIL_STEPS+=("$name")
  fi
}

skip() {
  local name="$1"; local reason="$2"
  echo
  echo "===== STEP: $name ====="
  echo "  -> SKIP: $name ($reason)"
  SKIP=$((SKIP+1))
  SKIP_STEPS+=("$name :: $reason")
}

# ----- Steps -----

# 1. install
step "pnpm install" bash -c "pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1"

# 2/3/4. Nx run-many. If Nx not configured for a target, it returns 0 with "no projects" message — acceptable.
step "nx typecheck" npx nx run-many -t typecheck --parallel=3
step "nx lint"      npx nx run-many -t lint --parallel=3
step "nx test"      npx nx run-many -t test --parallel=3

# 5. supabase db reset (local only; gated on running stack)
if command -v supabase >/dev/null 2>&1; then
  if (cd apps/backend && supabase status >/dev/null 2>&1); then
    step "supabase db reset (local)" bash -c "cd apps/backend && supabase db reset --local"
  else
    skip "supabase db reset" "local stack not running (run: cd apps/backend && supabase start)"
  fi
else
  skip "supabase db reset" "supabase CLI not on PATH"
fi

# 6. desktop probe typecheck
if [ -d apps/desktopProbe ]; then
  step "desktopProbe typecheck" bash -c "cd apps/desktopProbe && pnpm typecheck"
else
  skip "desktopProbe typecheck" "package missing"
fi

# 7. server probe build (gated)
if [ -d apps/serverProbe ]; then
  step "serverProbe build" bash -c "cd apps/serverProbe && pnpm build"
else
  skip "serverProbe build" "package not built yet"
fi

# 8. server probe headless probe-once (gated)
if [ -d apps/serverProbe ] && [ -f apps/serverProbe/dist/main.js ]; then
  step "serverProbe --probe-once" bash -c "cd apps/serverProbe && F2A_MOCK_SCRAPE=1 timeout 30 pnpm start --headless --probe-once"
else
  skip "serverProbe --probe-once" "build artifact missing"
fi

# 9. server web ui build (gated)
if [ -d apps/serverWebUI ]; then
  step "serverWebUI build" bash -c "cd apps/serverWebUI && pnpm build"
else
  skip "serverWebUI build" "package not built yet"
fi

# 10. ssh pi connectivity (best-effort)
if command -v ssh >/dev/null 2>&1; then
  step "ssh pi echo" ssh -o BatchMode=yes -o ConnectTimeout=5 pi 'echo OK'
else
  skip "ssh pi" "ssh not available"
fi

# 11. secret grep
step "secret grep" bash -c '
set -e
PATTERNS="sk-|sk-proj-|pk_live_|service_role|AKIA[A-Z0-9]{16}|ghp_|-----BEGIN [A-Z ]*PRIVATE KEY"
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.nx --exclude-dir=dist --exclude-dir=.next --exclude-dir=tests/fixtures --exclude=*.lock --exclude=pnpm-lock.yaml --exclude=*.example --exclude=decisions*.md --exclude=spec.md --exclude=plan.md --exclude=weekend-report.md --exclude=BACKLOG.md --exclude=CHANGELOG.md --exclude=README.md"
HITS=$(grep -rEn $EXCLUDES "$PATTERNS" . 2>/dev/null || true)
if [ -n "$HITS" ]; then
  echo "Potential secrets:"
  echo "$HITS"
  exit 1
fi
echo "no secrets matched"
'

# ----- Summary -----
echo
echo "================================================================"
echo "Dry-run summary: PASS=$PASS  FAIL=$FAIL  SKIP=$SKIP"
if [ "${#SKIP_STEPS[@]}" -gt 0 ]; then
  echo "Skipped:"
  for s in "${SKIP_STEPS[@]}"; do echo "  - $s"; done
fi
if [ "${#FAIL_STEPS[@]}" -gt 0 ]; then
  echo "Failed:"
  for s in "${FAIL_STEPS[@]}"; do echo "  - $s"; done
  exit 1
fi
exit 0
