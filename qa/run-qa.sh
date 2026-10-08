#!/usr/bin/env bash
# Tiered QA runner for first2apply.
#
#   qa/run-qa.sh fast   typecheck + prettier on changed backend files, vs baseline (~10s)
#   qa/run-qa.sh unit   deno parser tests + desktop vitest, vs baseline (~15s)
#   qa/run-qa.sh ui     Playwright against the packaged desktop app (needs a build)
#   qa/run-qa.sh all    fast + unit + ui
#
# Exit code is nonzero only when there is a NEW failure (not listed in qa/known-failures.json).
# Missing optional tools produce a SKIP row, never a failure.
# Report: qa/reports/<timestamp>.md   Screenshots: qa/reports/<timestamp>/screenshots/
set -u

TIER="${1:-all}"
case "$TIER" in fast | unit | ui | all) ;; *)
  echo "usage: qa/run-qa.sh {fast|unit|ui|all}" >&2
  exit 2
  ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2
QA="$ROOT/qa"
UTIL="$QA/lib/qa-util.js"
TS="$(date +%Y%m%d-%H%M%S)"
REPORT_MD="$QA/reports/$TS.md"
REPORT_DIR="$QA/reports/$TS"
mkdir -p "$REPORT_DIR"
export F2A_QA_REPORT_DIR="$REPORT_DIR"

FUNCS="$ROOT/apps/backend/supabase/functions"
APP_BIN="$ROOT/apps/desktopProbe/out/First 2 Apply-darwin-arm64/First 2 Apply.app/Contents/MacOS/First 2 Apply"

ROWS=()      # "tier|check|status|detail"
NEW_FAILS=0
NOTES=()

row() { # tier check status detail
  ROWS+=("$1|$2|$3|$4")
  [ "$3" = "FAIL" ] && NEW_FAILS=$((NEW_FAILS + 1))
  return 0
}
have() { command -v "$1" > /dev/null 2>&1; }
# Load the QA login from the macOS Keychain (service "f2a-qa") when not set in the environment.
load_qa_credentials() {
  [ -n "${F2A_QA_EMAIL:-}" ] && return 0
  have security || return 0
  local entry
  entry="$(security find-generic-password -s f2a-qa 2> /dev/null)" || return 0
  F2A_QA_EMAIL="$(printf '%s\n' "$entry" | sed -n 's/.*"acct"<blob>="\(.*\)"/\1/p' | head -1)"
  F2A_QA_PASSWORD="$(security find-generic-password -s f2a-qa -w 2> /dev/null)" || F2A_QA_PASSWORD=""
  [ -n "$F2A_QA_EMAIL" ] && [ -n "$F2A_QA_PASSWORD" ] && export F2A_QA_EMAIL F2A_QA_PASSWORD
  return 0
}
load_qa_credentials

log() { printf '%s\n' "$*" >&2; }

# -{74}-------------------- helpers
ensure_node_deps() {
  if [ ! -d "$ROOT/node_modules" ]; then
    log "WARN: node_modules missing, run: pnpm install --frozen-lockfile"
    return 1
  fi
  return 0
}

ensure_lib_builds() {
  # desktop vitest and the desktop typecheck import the built libraries
  local lib
  for lib in core scraper ui; do
    # rebuild when output is missing or any source file is newer than it (stale builds hid real type errors)
    if [ ! -d "$ROOT/libraries/$lib/build" ] \
      || [ -n "$(find "$ROOT/libraries/$lib/src" -type f -newer "$ROOT/libraries/$lib/build" -print -quit 2> /dev/null)" ]; then
      log "building @first2apply/$lib (missing or stale build output)"
      pnpm --filter "@first2apply/$lib" build > "$REPORT_DIR/build-$lib.log" 2>&1 \
        || log "WARN: build of $lib failed, see $REPORT_DIR/build-$lib.log"
    fi
  done
}

restore_deno_lock() {
  # deno rewrites deno.lock on every run
  if git -C "$ROOT" ls-files --error-unmatch apps/backend/supabase/functions/deno.lock > /dev/null 2>&1; then
    git -C "$ROOT" checkout -- apps/backend/supabase/functions/deno.lock 2> /dev/null || true
  fi
}

changed_backend_files() {
  # Committed-but-unpushed, staged, unstaged, and untracked backend .ts files that still exist.
  local base=""
  if git -C "$ROOT" rev-parse --verify -q origin/master > /dev/null; then
    base="$(git -C "$ROOT" merge-base HEAD origin/master 2> /dev/null)"
  elif git -C "$ROOT" rev-parse --verify -q master > /dev/null; then
    base="$(git -C "$ROOT" merge-base HEAD master 2> /dev/null)"
  fi
  {
    [ -n "$base" ] && git -C "$ROOT" diff --name-only "$base" HEAD
    git -C "$ROOT" diff --name-only HEAD
    git -C "$ROOT" ls-files --others --exclude-standard
  } 2> /dev/null | grep -E '^apps/backend/.*\.ts$' | sort -u | while read -r f; do
    [ -f "$ROOT/$f" ] && echo "$f"
  done
}

# -{74}-------------------- fast
tier_fast() {
  # 1. backend typecheck vs baseline count
  if have deno; then
    local out="$REPORT_DIR/deno-check.log"
    (cd "$FUNCS" && deno check **/*.ts > "$out" 2>&1)
    restore_deno_lock
    local count base
    count="$(node "$UTIL" tc-count "$out")"
    base="$(node "$UTIL" baseline backend_typecheck.error_count)"
    base="${base:-0}"
    if [ "$count" -gt "$base" ]; then
      row fast "backend typecheck" FAIL "$count errors, baseline $base (see $out)"
    elif [ "$count" -lt "$base" ]; then
      row fast "backend typecheck" PASS "$count errors, baseline $base. Lower error_count in known-failures.json"
    elif [ "$count" -gt 0 ]; then
      row fast "backend typecheck" KNOWN "$count errors, equal to baseline"
    else
      row fast "backend typecheck" PASS "0 errors"
    fi
  else
    row fast "backend typecheck" SKIP "deno not installed"
  fi

  # 2. desktop typecheck (must be clean)
  if ensure_node_deps; then
    ensure_lib_builds
    if pnpm --filter first2apply-desktop typecheck > "$REPORT_DIR/desktop-typecheck.log" 2>&1; then
      row fast "desktop typecheck" PASS "tsc --noEmit clean"
    else
      row fast "desktop typecheck" FAIL "see $REPORT_DIR/desktop-typecheck.log"
    fi
  else
    row fast "desktop typecheck" SKIP "node_modules missing"
  fi

  # 3. prettier on changed backend files
  local files
  files="$(changed_backend_files)"
  if [ -z "$files" ]; then
    row fast "prettier (changed backend)" PASS "no changed backend files"
  elif have npx && [ -d "$ROOT/node_modules" ]; then
    # shellcheck disable=SC2086
    if (cd "$ROOT" && npx prettier --check $files > "$REPORT_DIR/prettier.log" 2>&1); then
      row fast "prettier (changed backend)" PASS "$(echo "$files" | wc -l | tr -d ' ') files clean"
    else
      row fast "prettier (changed backend)" FAIL "see $REPORT_DIR/prettier.log"
    fi
  else
    row fast "prettier (changed backend)" SKIP "prettier unavailable"
  fi
}

# -{74}-------------------- unit
record_suite() { # suite tier label results.tsv exitcode logfile
  local suite="$1" tier="$2" label="$3" tsv="$4" code="$5" logf="$6"
  local total
  total="$(grep -c . "$tsv" 2> /dev/null || true)"
  if [ "${total:-0}" -eq 0 ]; then
    if [ "$code" -ne 0 ]; then
      row "$tier" "$label" FAIL "no test results parsed and exit $code (see $logf)"
    else
      row "$tier" "$label" FAIL "no tests were run (see $logf)"
    fi
    return
  fi
  local cmp new=0 known=0 fixed=0 newnames=""
  cmp="$(node "$UTIL" compare "$suite" "$tsv")"
  while IFS=$'\t' read -r kind name; do
    case "$kind" in
      NEW) new=$((new + 1)); newnames="$newnames [$name]" ;;
      KNOWN) known=$((known + 1)) ;;
      FIXED) fixed=$((fixed + 1)); NOTES+=("$label: known failure now passes, remove it from qa/known-failures.json: $name") ;;
    esac
  done <<< "$cmp"
  local passed
  passed="$(grep -c $'\tok$' "$tsv" || true)"
  if [ "$new" -gt 0 ]; then
    row "$tier" "$label" FAIL "$new new failure(s):$newnames"
  elif [ "$known" -gt 0 ]; then
    row "$tier" "$label" KNOWN "$passed passed, $known known failure(s)"
  else
    row "$tier" "$label" PASS "$passed passed"
  fi
}

tier_unit() {
  if have deno; then
    local out="$REPORT_DIR/deno-test.log" tsv="$REPORT_DIR/deno-test.tsv"
    (cd "$FUNCS" && deno test -A --no-check --sloppy-imports _shared/jobListParser.test.ts > "$out" 2>&1)
    local code=$?
    restore_deno_lock
    node "$UTIL" deno-parse "$out" > "$tsv"
    record_suite deno unit "deno parser tests" "$tsv" "$code" "$out"
  else
    row unit "deno parser tests" SKIP "deno not installed"
  fi

  if ensure_node_deps; then
    ensure_lib_builds
    local out="$REPORT_DIR/vitest.log" json="$REPORT_DIR/vitest.json" tsv="$REPORT_DIR/vitest.tsv"
    pnpm --filter first2apply-desktop exec vitest run --reporter=json --outputFile="$json" > "$out" 2>&1
    local code=$?
    if [ -f "$json" ]; then
      node "$UTIL" vitest-parse "$json" > "$tsv"
    else
      : > "$tsv"
    fi
    record_suite vitest unit "desktop vitest" "$tsv" "$code" "$out"
  else
    row unit "desktop vitest" SKIP "node_modules missing"
  fi
}

# -{74}-------------------- ui
app_is_stale() {
  [ ! -x "$APP_BIN" ] && return 0
  [ -n "$(find "$ROOT/apps/desktopProbe/src" "$ROOT"/libraries/*/src -type f -newer "$APP_BIN" 2> /dev/null | head -1)" ]
}

build_app() {
  ensure_lib_builds
  # The renderer/main bundles inline these at build time. Real values come from
  # apps/desktopProbe/.env when present (forge loads it). Without it, use inert placeholders,
  # which is enough for the unauthenticated specs.
  if [ ! -f "$ROOT/apps/desktopProbe/.env" ]; then
    export APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.first2apply.qa}"
    export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
    export SUPABASE_KEY="${SUPABASE_KEY:-qa-placeholder}"
    export MEZMO_API_KEY="${MEZMO_API_KEY:-qa-placeholder}"
    export AMPLITUDE_API_KEY="${AMPLITUDE_API_KEY:-qa-placeholder}"
    NOTES+=("UI build used placeholder backend values (no apps/desktopProbe/.env). Authenticated specs need a real build.")
  fi
  log "packaging desktop app (electron-forge package)..."
  pnpm --filter first2apply-desktop package > "$REPORT_DIR/package.log" 2>&1
}

tier_ui() {
  if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    if [ -z "${F2A_QA_APP_BINARY:-}" ]; then
      row ui "desktop UI (Playwright)" SKIP "default app path is darwin-arm64, set F2A_QA_APP_BINARY on other platforms"
      return
    fi
  fi
  if ! have pnpm || ! ensure_node_deps; then
    row ui "desktop UI (Playwright)" SKIP "pnpm or node_modules missing"
    return
  fi
  if [ ! -d "$QA/node_modules/@playwright" ]; then
    log "installing qa/ dependencies..."
    (cd "$QA" && pnpm install --ignore-workspace --frozen-lockfile > "$REPORT_DIR/qa-install.log" 2>&1) \
      || { row ui "desktop UI (Playwright)" FAIL "qa install failed, see $REPORT_DIR/qa-install.log"; return; }
  fi
  if [ -z "${F2A_QA_APP_BINARY:-}" ] && app_is_stale; then
    if ! build_app; then
      row ui "desktop UI (Playwright)" FAIL "app build failed, see $REPORT_DIR/package.log"
      return
    fi
  fi
  local tsv="$REPORT_DIR/ui.tsv" out="$REPORT_DIR/playwright.log"
  (cd "$QA" && npx playwright test > "$out" 2>&1)
  local code=$?
  if [ -f "$REPORT_DIR/playwright-results.json" ]; then
    node "$UTIL" pw-parse "$REPORT_DIR/playwright-results.json" > "$tsv"
  else
    : > "$tsv"
  fi
  # One row per spec test.
  local n=0
  while IFS=$'\t' read -r name status; do
    n=$((n + 1))
    case "$status" in
      ok) row ui "$name" PASS "" ;;
      skipped) row ui "$name" SKIP "test.skip, see spec for reason" ;;
      FAILED)
        if node "$UTIL" compare ui "$tsv" | grep -q "^KNOWN"$'\t'"$name\$"; then
          row ui "$name" KNOWN "known failure"
        else
          row ui "$name" FAIL "see $out"
        fi ;;
    esac
  done < "$tsv"
  if [ "$n" -eq 0 ]; then
    row ui "desktop UI (Playwright)" FAIL "no results parsed, exit $code (see $out)"
  fi
  if grep -q $'\tskipped$' "$tsv" && [ -z "${F2A_QA_EMAIL:-}" ]; then
    NOTES+=("Authenticated UI specs were skipped. Set F2A_QA_EMAIL and F2A_QA_PASSWORD (and build with a real apps/desktopProbe/.env) to run them.")
  fi
}

# -{74}-------------------- run
START=$SECONDS
case "$TIER" in
  fast) tier_fast ;;
  unit) tier_unit ;;
  ui) tier_ui ;;
  all) tier_fast; tier_unit; tier_ui ;;
esac
ELAPSED=$((SECONDS - START))

# -{74}-------------------- output
{
  echo "# QA report $TS"
  echo
  echo "- Tier: \`$TIER\`"
  echo "- Branch: \`$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2> /dev/null)\` at \`$(git -C "$ROOT" rev-parse --short HEAD 2> /dev/null)\`"
  echo "- Duration: ${ELAPSED}s"
  echo "- New failures: $NEW_FAILS"
  echo
  echo "| Tier | Check | Status | Detail |"
  echo "|------|-------|--------|--------|"
  for r in "${ROWS[@]}"; do
    IFS='|' read -r t c s d <<< "$r"
    echo "| $t | $c | $s | ${d//|/\\|} |"
  done
  if [ ${#NOTES[@]} -gt 0 ]; then
    echo
    echo "## Notes"
    for n in "${NOTES[@]}"; do echo "- $n"; done
  fi
  if ls "$REPORT_DIR/screenshots"/*.png > /dev/null 2>&1; then
    echo
    echo "## Screenshots"
    for p in "$REPORT_DIR/screenshots"/*.png; do
      echo "- \`${p#"$ROOT"/}\`"
    done
  fi
  echo
  echo "Logs: \`${REPORT_DIR#"$ROOT"/}/\`"
} > "$REPORT_MD"

echo
printf '%-6s %-74s %-6s %s\n' TIER CHECK STATUS DETAIL
printf '%-6s %-74s %-6s %s\n' ------ ---------------------------------------------------------------------------- ------ ------
for r in "${ROWS[@]}"; do
  IFS='|' read -r t c s d <<< "$r"
  printf '%-6s %-74s %-6s %s\n' "$t" "${c:0:74}" "$s" "$d"
done
echo
for n in "${NOTES[@]+"${NOTES[@]}"}"; do echo "note: $n"; done
echo "report: ${REPORT_MD#"$ROOT"/}  (${ELAPSED}s)"
if [ "$NEW_FAILS" -gt 0 ]; then
  echo "RESULT: FAIL ($NEW_FAILS new failure(s))"
  exit 1
fi
echo "RESULT: PASS (no new failures)"
exit 0
