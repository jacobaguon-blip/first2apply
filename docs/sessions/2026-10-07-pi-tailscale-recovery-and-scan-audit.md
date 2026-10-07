# 2026-10-07: Pi Tailscale recovery, scan audit, REI link

Outcome: Pi back on Tailscale, boot persistence verified, jobs confirmed landing again (custom boards only), REI search link 270 added. Scan queue starvation identified as the main remaining problem.

## Original Issue
- Continue the project after Supabase restore: Pi Tailscale back online, explain what is needed from the user, then continue.

## Follow-up Issues
- Tailscale on the Pi was still logged out after the first login attempt; a fresh login URL was needed.
- Pi power-outage resilience question.
- User supplied an REI jobs search URL to add.

## Completed Tasks
- [x] Diagnosed Pi Tailscale (logged out, key expired) and generated a fresh login URL with the Pi's existing flags (accept-dns=false, accept-routes, advertise-routes=192.168.4.0/24). Pi back online, reachable at `raspberrypi` over Tailscale.
- [x] Verified boot persistence: tailscaled, docker and f2a-server-probe.service enabled; probe has Restart=on-failure. Root cause of the outage was node-key expiry, not power.
- [x] Audited scanning: new jobs landed 2026-10-07 18:00 UTC (first since 2026-08-15), but only 2 jobs, both custom boards.
- [x] Found queue starvation: 42 of 44 links are custom boards on a 3B CPU model that times out; LinkedIn links 3 and 4 had no scan activity in 6h. Logged as P1 and pushed (06601f2).
- [x] Added link id 270 (REI filtered search, site 17, daily) via service-role insert and backdated `last_scraped_at` so it scans next cycle; page fetch returned HTTP 200.

## Skills Used
- `/summary` (this document)

## Tools & Commands Used
- `Bash` for ssh to the Pi, tailscale CLI, docker logs, Supabase REST API with the Pi's service-role key (never printed)

## Key Findings
- Tailscale key expiry, not a power cut, took the Pi off the tunnel; auto-reconnect already works after outages.
- Tailscale API token in Keychain (`tailscale-api`) is invalid, so key expiry could not be disabled from here.
- Existing REI link 6 (`rei.jobs/careers-home/jobs`) has 77 consecutive failures.
- Merged upstream LinkedIn parser still unverified on live pages.

## Current State
- Pi online and healthy; scanner serialized behind slow custom-board parses.
- Link 270 queued, outcome unknown.
- Waiting on user for scan-priority decision, QA credentials, key-expiry toggle.

## Next Steps
- [→ P1] Disable key expiry for `raspberrypi` in the Tailscale admin console.
- [→ P1] Implement the scan priority fix (non-custom links first) once the user picks an option.
- [→ P2] Check link 270 and LinkedIn link results after the next scan cycle.
- [→ P3] Refresh the Tailscale API token in Keychain (`tailscale-api`).
- [→ P2] QA credentials and authenticated UI run (already in backlog).

## Session Stats
- Turns: about 6. Tokens: roughly 150k estimated. Cost: roughly $1 to $2 estimated, Sonnet pricing.
