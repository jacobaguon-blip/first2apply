#!/usr/bin/env bash
# deploy.sh — idempotent deploy of the latest server-probe image.
#   - Tags current :latest as :previous (rollback path)
#   - Pulls new :latest
#   - Prunes dangling images (keeps :previous because it's tagged)
#   - Restarts the systemd unit
#
# Idempotent: a second run with no upstream change is a no-op (pull is up-to-date,
# previous tag is rewritten, prune finds nothing dangling, restart is harmless).
set -euo pipefail

IMAGE="${F2A_IMAGE:-ghcr.io/jacobaguon-blip/f2a-server-probe}"

if docker image inspect "${IMAGE}:latest" >/dev/null 2>&1; then
  docker tag "${IMAGE}:latest" "${IMAGE}:previous"
  echo "tagged ${IMAGE}:previous"
fi

docker pull "${IMAGE}:latest"
docker image prune -f

sudo systemctl restart f2a-server-probe.service

echo "deploy complete. Tail logs with: journalctl -u f2a-server-probe -f"
