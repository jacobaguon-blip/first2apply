# Phase 2 deploy prompt — manual-scan Pi HTTP control endpoint

Paste this into a Claude Code session when you're ready to wire up the manual-scan button end-to-end on the live Pi + your machine.

---

I previously built a Pi-side HTTP control server for first2apply so the desktop app can trigger immediate scans via Tailscale. The code lives in:

- `apps/serverProbe/src/controlServer.ts` (new file — Bearer-auth HTTP listener with `POST /scan/link/:id`, `POST /scan/user/:userId`, `GET /status`)
- `apps/serverProbe/src/env.ts` (added `F2A_PROBE_SECRET`, `F2A_PROBE_PORT`, `F2A_PROBE_BIND`)
- `apps/serverProbe/src/main.ts` (wires up the control server in `serve` mode iff `F2A_PROBE_SECRET` is set)
- `apps/serverProbe/Dockerfile` (`EXPOSE 7878 7879`)
- `apps/desktopProbe/src/env.ts` (added `ENV.probe.{url,secret}`)
- `apps/desktopProbe/src/server/rendererIpcApi.ts` (`tryProbeScan()` helper; `scan-link` and `scan-all-my-links` IPC handlers try Pi first, fall back to local scanner)
- `apps/desktopProbe/src/lib/electronMainSdk.tsx` (new `scanAllMyLinks()` SDK method)
- `apps/desktopProbe/src/pages/links.tsx` (new "Scan all now" button + toast copy reflecting Pi vs local)

Both TypeScript builds are clean. Now finish Phase 2 — deploy:

1. **Generate the shared secret**: `openssl rand -hex 32`. Store the value once; it will live in two places.
2. **Inject on the Pi**: SSH `maadkal@100.93.137.31` (Tailscale IP for `raspberrypi`). Append `F2A_PROBE_SECRET=...` to `/opt/first2apply/.env` (chmod 600). Restart with `sudo systemctl restart f2a-server-probe.service`. The systemd unit is `deploy/pi/systemd/f2a-server-probe.service` and uses `--network host`, so port 7879 binds directly on the host.
3. **Verify the Pi endpoint**: from my Mac, `curl -sS -H "Authorization: Bearer <SECRET>" http://100.93.137.31:7879/status` should return `{"isScanning":false,"lastScanAt":"..."}`. Without the header → 401. Try once more with `http://raspberrypi:7879/status` to confirm Tailscale MagicDNS resolves.
4. **Rebuild and re-publish the Pi container** if my code edits haven't shipped yet: `apps/serverProbe/Dockerfile` was modified (added `EXPOSE 7879`) and `apps/serverProbe/src/{main,env,controlServer}.ts` changed. The deploy script is `deploy/pi/deploy.sh`. Image is `ghcr.io/jacobaguon-blip/f2a-server-probe:latest`. Check whether GitHub Actions auto-builds or whether I need to push the image manually.
5. **Embed in the desktop app**: The desktop reads `F2A_PROBE_URL` and `F2A_PROBE_SECRET` from `process.env`. Figure out where electron-forge defines bundled env vars (likely `apps/desktopProbe/forge.config.{ts,js}` or a `.env` consumed at build time) and set:
   - `F2A_PROBE_URL=http://raspberrypi:7879`
   - `F2A_PROBE_SECRET=<same secret as Pi>`
6. **Test end-to-end**:
   - Click the per-card refresh icon on the REI card. SSH the Pi: `docker logs f2a-server-probe --since 1m | grep "control: scan request"` — should show `linkId: 6, source: 'http'` within seconds.
   - Click "Scan all now" — the Pi log should show `control: scan request (user)` with the user id and link count.
   - Stop my Mac's tailscale (`tailscale down`), click again — toast should say "Pi unreachable — scanning locally" and the local desktop scanner should kick in (existing behavior preserved).
7. **Ship**: bump version, rebuild the desktop app, run `scripts/publish-release.sh` then `deploy-to-her.sh` to push to my wife's laptop.

Constraints to honor:
- Don't change the hourly cron — it stays on the existing `0 * * * *` schedule.
- Don't expose 7879 to LAN/WAN; the systemd unit uses `--network host` so document that the Pi's firewall (ufw / iptables) needs port 7879 closed except on the Tailscale interface. If that's already locked down, fine.
- The desktop fallback to local scanning MUST keep working when the Pi is unreachable.

Plan file: `/Users/jacobaguon/.claude/plans/no-that-s-not-what-delegated-mountain.md` has the full design context.
