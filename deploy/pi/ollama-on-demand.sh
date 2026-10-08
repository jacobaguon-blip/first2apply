#!/usr/bin/env bash
set -euo pipefail
IDLE_TIMEOUT=300
LOAD_GRACE=900
CONTAINER="ollama"
STATE_FILE="/tmp/ollama-last-active"
log() { echo "[ollama-on-demand] $(date +%H:%M:%S) $*"; }
edge_running=$(docker inspect -f "{{.State.Running}}" f2a-edge-local 2>/dev/null || echo "false")
ollama_running=$(docker inspect -f "{{.State.Running}}" "$CONTAINER" 2>/dev/null || echo "false")
if [ "$edge_running" != "true" ]; then
    if [ "$ollama_running" = "true" ]; then
        log "Edge runtime stopped - stopping Ollama"
        docker stop "$CONTAINER" >/dev/null 2>&1 || true
        rm -f "$STATE_FILE"
    fi
    exit 0
fi
if [ "$ollama_running" = "true" ]; then
    active=$(curl -sf http://127.0.0.1:11434/api/ps 2>/dev/null | python3 -c "import sys,json; m=json.load(sys.stdin).get(\"models\",[]); print(len(m))" 2>/dev/null || echo "0")
    # A model that is still LOADING does not show up in /api/ps, and on this CPU-only Pi a cold load can take
    # minutes. Without the two checks below this script killed Ollama in the middle of every slow load
    # ("Idle for 312s - stopping Ollama"), so no model could ever finish loading and scans wedged.
    # 1) any non-health log line in the last 90s (load or generation progress) counts as activity;
    # 2) a container that started less than LOAD_GRACE seconds ago is never stopped.
    busy=$(docker logs --since 90s "$CONTAINER" 2>&1 | grep -vE '\| (GET|HEAD) ' | grep -c . || true)
    started=$(docker inspect -f "{{.State.StartedAt}}" "$CONTAINER" 2>/dev/null || echo "")
    started_epoch=$(date -d "$started" +%s 2>/dev/null || echo 0)
    uptime_s=$(( $(date +%s) - started_epoch ))
    if [ "$active" != "0" ] || [ "${busy:-0}" -gt 0 ] || [ "$uptime_s" -lt "$LOAD_GRACE" ]; then
        date +%s > "$STATE_FILE"
        exit 0
    fi
    if [ -f "$STATE_FILE" ]; then
        last_active=$(cat "$STATE_FILE")
        now=$(date +%s)
        idle=$((now - last_active))
        if [ "$idle" -ge "$IDLE_TIMEOUT" ]; then
            log "Idle for ${idle}s - stopping Ollama"
            docker stop "$CONTAINER" >/dev/null 2>&1 || true
            rm -f "$STATE_FILE"
        fi
    else
        date +%s > "$STATE_FILE"
    fi
else
    log "Edge runtime active, starting Ollama on-demand"
    docker start "$CONTAINER" >/dev/null 2>&1 || true
    date +%s > "$STATE_FILE"
fi
