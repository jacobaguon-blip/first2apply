# 2026-05-11 — Pi manual scan endpoint + service-role auth fix

**Outcome**: Manual-scan button live in 2.3.6, Pi HTTP control server shipping, edge functions fixed to accept service-role JWT.

## Original Issue
User adding target company pages (REI, Patagonia) and wanted to (a) validate the Pi is actually scanning them, and (b) wire a manual-scan button (per-link + global) so his wife can trigger immediate Pi-side scans from the desktop app.

## Follow-up Issues
- `scan-urls` edge function silently failing for every probe-driven scan: `auth.getUser()` rejects service-role JWT with `"invalid claim: missing sub claim"`. `last_scraped_at` was never being written for any Pi-scanned link.

## Completed Tasks
- Verified Pi is the worker (logs show hourly REI + Patagonia URL navigation)
- Reproduced `scan-urls` auth bug via direct curl
- Fixed `_shared/edgeFunctions.ts` to detect service-role JWT and skip `auth.getUser`
- Updated `scan-urls`, `scan-job-description`, `post-scan-hook`, `create-link`, `_shared/jobListParser.ts` to handle nullable user
- Deployed 4 edge functions to Supabase Cloud
- Built `apps/serverProbe/src/controlServer.ts` (POST /scan/link/:id, /scan/user/:userId, GET /status, bearer-auth)
- Wired into `serverProbe/main.ts` + Dockerfile (`EXPOSE 7879`) + env vars
- Updated `desktopProbe/server/rendererIpcApi.ts` with `tryProbeScan()` helper + IPC handlers; Pi-first with local fallback
- Added `scanAllMyLinks()` SDK + global "Scan all now" button to `pages/links.tsx`
- Added `F2A_PROBE_URL`/`F2A_PROBE_SECRET` to webpack EnvironmentPlugin + desktop `.env`
- Generated bearer secret, appended to Pi `/opt/first2apply/.env`
- Pushed 2 commits to master, CI built new arm64 Pi image, deployed via `deploy/pi/deploy.sh`
- Verified: 401 without bearer, JSON with bearer, `POST /scan/link/7` → Patagonia loaded within ~1s
- Built 2.3.6, asar verified to contain `raspberrypi`/`7879`/secret prefix
- Deployed 2.3.6 to wife's Mac via `deploy-to-her.sh`

## Skills Used
- None

## Key Findings
- Service-role JWT has no `sub` claim, so `auth.getUser()` fails with `"invalid claim: missing sub claim"`. Affected EVERY edge function call from the Pi probe. HTTP 200 masked the error.
- `f2a-server-probe.service` runs `--network host`, so port 7879 binds on all Pi interfaces; bearer secret is the only network-layer auth.
- `publish-release.sh` crashes at the dmg-maker step (`NODE_MODULE_VERSION 137 vs 141` on `macos-alias`). `.app` builds fine — manual stage works as a workaround.
- REI Custom Job Board (Beta) parser returns 0 jobs even after auth fix (large HTML 373KB → GPT-4o extraction quality issue, separate concern).

## Current State
All ship targets live in production: Supabase edge functions deployed, Pi container running the control server, wife's Mac on 2.3.6 with the manual-scan button. CI green, container healthy.

## Next Steps
- Have wife click "Scan all now" to validate renderer→Pi flow from her machine [→ P1]
- Fix REI Custom Job Board (Beta) parser quality [→ P2]
- Fix `publish-release.sh` dmg-maker crash [→ P3]
- Lock port 7879 to Tailscale interface via Pi firewall [→ P3]

## Session Stats
- Turns: ~40
- Tokens: ~280k estimated
- Cost: ~$5 (Opus)
