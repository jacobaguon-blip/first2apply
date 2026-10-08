#!/usr/bin/env bash
# Idempotently create the QA account and its fixture data in the cloud Supabase project.
#
# Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (service role, never commit it).
# The Pi has both in /opt/first2apply-mono/apps/backend/supabase/functions/.env.
# Stores the generated password in the macOS Keychain (service "f2a-qa"), never in a file.
#
# Fixture data, and why it exists:
#   - 4 jobs with remote/hybrid/onsite/unspecified locations (sort + location filter checks)
#   - 1 search (link) with last_scraped_at in 2099 so the Pi scanner never touches it
#     (the app shows an onboarding screen instead of jobs when an account has no searches)
#   - profiles.career_ops_enabled = true (the Sort control only renders for career-ops accounts)
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
EMAIL="${F2A_QA_EMAIL:-f2a-qa@first2apply-qa.example.com}"
H=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json")
api() { curl -sS "${H[@]}" "$@"; }

uid="$(api "$SUPABASE_URL/auth/v1/admin/users?per_page=200" | python3 -c '
import sys, json
email = sys.argv[1]
for u in json.load(sys.stdin).get("users", []):
    if u.get("email") == email:
        print(u["id"])
' "$EMAIL")"

if [ -z "$uid" ]; then
  pw="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
  uid="$(api -X POST "$SUPABASE_URL/auth/v1/admin/users" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$pw\",\"email_confirm\":true}" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["id"])')"
  security add-generic-password -a "$EMAIL" -s f2a-qa -w "$pw" -U
  echo "created QA user $uid, password stored in Keychain service f2a-qa"
else
  echo "QA user exists: $uid"
fi

# profile flag
api -X PATCH "$SUPABASE_URL/rest/v1/profiles?user_id=eq.$uid" -H "Prefer: return=minimal" \
  -d '{"career_ops_enabled":true}' > /dev/null

# link (search), created once
link_id="$(api "$SUPABASE_URL/rest/v1/links?select=id&user_id=eq.$uid&limit=1" | python3 -c '
import sys, json
r = json.load(sys.stdin)
print(r[0]["id"] if r else "")')"
if [ -z "$link_id" ]; then
  link_id="$(api -X POST "$SUPABASE_URL/rest/v1/links" -H "Prefer: return=representation" \
    -d "{\"user_id\":\"$uid\",\"url\":\"https://example.com/qa-seed\",\"title\":\"QA seed search (never scanned)\",\"site_id\":17,\"scan_frequency\":\"daily\",\"last_scraped_at\":\"2099-01-01T00:00:00Z\"}" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)[0]["id"])')"
  echo "created QA link $link_id"
fi

# jobs, created once
count="$(api "$SUPABASE_URL/rest/v1/jobs?select=id&user_id=eq.$uid" | python3 -c 'import sys, json; print(len(json.load(sys.stdin)))')"
if [ "$count" -eq 0 ]; then
  python3 - "$uid" "$link_id" > /tmp/f2a_qa_jobs.json <<'PY'
import json, sys
uid, link_id = sys.argv[1], int(sys.argv[2])
rows = []
fixtures = [
    ("QA Remote Engineer", "QA Co A", "Remote, United States", "remote"),
    ("QA Hybrid Analyst", "QA Co B", "Denver, CO (Hybrid)", "hybrid"),
    ("QA Onsite Technician", "QA Co C", "Seattle, WA", "onsite"),
    ("QA Unspecified Role", "QA Co D", None, None),
]
for i, (title, company, location, job_type) in enumerate(fixtures):
    rows.append({
        "user_id": uid, "link_id": link_id, "externalId": f"qa-seed-{i}",
        "externalUrl": f"https://example.com/qa/{i}", "siteId": 17, "title": title,
        "companyName": company, "location": location, "jobType": job_type, "tags": [],
        "status": "new", "labels": [], "description": "Seed job for automated QA. Safe to delete.",
    })
print(json.dumps(rows))
PY
  api -X POST "$SUPABASE_URL/rest/v1/jobs" -H "Prefer: return=minimal" -d @/tmp/f2a_qa_jobs.json > /dev/null
  rm -f /tmp/f2a_qa_jobs.json
  echo "seeded 4 QA jobs"
else
  echo "QA jobs already present ($count)"
fi
