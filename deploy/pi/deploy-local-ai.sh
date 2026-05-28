#!/usr/bin/env bash
# Idempotent deploy of the local-AI stack (Ollama + self-hosted edge runtime)
# on the Pi. Safe to re-run: existing containers are migrated to the compose
# project on first run; subsequent runs are no-ops if nothing changed.
#
#   - Pulls latest deno + ollama images.
#   - Brings up the stack with restart: unless-stopped.
#   - Verifies the f2a-edge-local /health endpoint responds.
#
# Pre-requisites: /opt/first2apply-mono populated (rsync the repo's
# apps/backend/supabase/functions + libraries/core); /opt/first2apply-mono/
# apps/backend/supabase/functions/.env present with SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, F2A_AI_PROVIDER=local, F2A_OLLAMA_URL,
# F2A_OLLAMA_MODEL, F2A_LOCAL_FN_PORT, F2A_WEBHOOK_SECRET.
set -euo pipefail

COMPOSE_FILE="$(dirname "$0")/compose.local-ai.yaml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "FATAL: compose file not found at $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -d /opt/first2apply-mono/apps/backend/supabase/functions ]; then
  echo "FATAL: functions not deployed to /opt/first2apply-mono. rsync the repo first." >&2
  exit 1
fi

if [ ! -f /opt/first2apply-mono/apps/backend/supabase/functions/.env ]; then
  echo "FATAL: missing .env at /opt/first2apply-mono/apps/backend/supabase/functions/.env" >&2
  exit 1
fi

# Bring down any pre-compose containers with the same names so compose can take
# them over without conflict (first run after migrating off ad-hoc docker run).
for c in ollama f2a-edge-local; do
  if docker inspect "$c" >/dev/null 2>&1; then
    # Only force-remove if NOT already managed by this compose project.
    label=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$c" 2>/dev/null || true)
    if [ "$label" != "f2a-local-ai" ]; then
      echo "migrating $c to compose project (removing ad-hoc container)"
      docker rm -f "$c" >/dev/null
    fi
  fi
done

echo "pulling latest images..."
docker compose -f "$COMPOSE_FILE" pull

echo "starting stack..."
docker compose -f "$COMPOSE_FILE" up -d

echo "waiting for edge health..."
for i in $(seq 1 12); do
  if curl -fsS -m 3 http://127.0.0.1:54321/functions/v1/health >/dev/null 2>&1; then
    echo "edge healthy"
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi
  sleep 5
done

echo "FATAL: edge did not become healthy within 60s" >&2
docker compose -f "$COMPOSE_FILE" ps
docker logs --tail 40 f2a-edge-local 2>&1 | tail -40
exit 1
