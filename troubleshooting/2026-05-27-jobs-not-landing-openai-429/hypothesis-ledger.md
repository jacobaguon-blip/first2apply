# Jobs not landing / scan stuck — OpenAI 429 quota exhausted

Last updated: 2026-05-27

## Symptom
- Desktop UI shows newest jobs "detected last week" / "6 days ago"; nothing newer.
- Clicking Scan appears stuck on "scanning".

## How scanning actually works (validated)
- Desktop tries the Pi probe first: `tryProbeScan()` POSTs to `F2A_PROBE_URL` (`http://raspberrypi:7879`) with a 4s timeout (`apps/desktopProbe/src/server/rendererIpcApi.ts:40,667-688`). If the Pi accepts (HTTP 2xx) the local scanner never runs (`triggeredVia: 'pi'`); otherwise it falls back to a local scan.
- The Pi runs `serverProbe` in the `f2a-server-probe` Docker container, cron `F2A_CRON_RULE=0 * * * *` (hourly), owner `F2A_OWNER_USER_ID=3fd66611-...`.
- HTML for each link is fetched, then parsed into jobs by the cloud Supabase **edge function** `scan-urls`, which calls **OpenAI**. Parsed jobs upsert into the `jobs` table (`apps/backend/supabase/functions/scan-urls/index.ts`).
- UI "scanning" spinner = local `jobScanner.isScanning()` (`_runningScansCount > 0`), polled every 2s (`apps/desktopProbe/src/hooks/appState.tsx:50`). A local scan takes ~277s, with no per-link download timeout.

## Evidence
- Pi reachable: Tailscale up, ping OK, port 7879 listening (404 on `/health`, real routes `/scan/...`). Test POST to `/scan/link/1` → HTTP 202 `accepted:true`. Probe service is healthy ("Up 2 weeks").
- Cron is firing: hourly `scan complete in 277 seconds` entries, container healthy.
- **Every link parse fails:** `[edge] parse error ...: 429 You exceeded your current quota, please check your plan and billing details` → `failed to parse html` → link counted as failure.
- Every scan ends `scan_links_complete { links_count: 28-29, new_jobs_count: 0 }`.
- 3736 `exceeded your current quota` errors in retained logs; earliest retained 2026-05-24T04:00Z, latest 2026-05-27T23:04Z. Symptom onset ~1 week ago (log retention only goes back to 5/24).

## Root cause
The OpenAI account/key used by the cloud Supabase `scan-urls` edge function has **exhausted its quota/billing (HTTP 429)**. Scanning infrastructure (Pi cron, probe, downloads) is fully working — but the AI parse step returns 429 for every link, so zero jobs are extracted and nothing new lands. This is a billing/config issue, not a code bug. Ties to [[project_ai_provider_swap]] (fork uses vanilla OpenAI in edge functions).

The "stuck scanning" UI is a secondary symptom: scans still run (~277s) while every link errors/retries, so the spinner stays up the whole time and finishes with 0 jobs.

## Fix (owner action — not code)
1. Restore OpenAI quota: add credits / fix billing on the OpenAI account, or rotate to a funded key.
2. Update `OPENAI_API_KEY` in the **cloud Supabase edge function secrets** (where the 429 originates), and on the Pi `/opt/first2apply` `.env` if it also calls OpenAI directly.
3. Trigger a scan and confirm `new_jobs_count > 0`.

## Verification
- After key/quota fix: `docker logs --since 1h f2a-server-probe | grep scan_links_complete` should show `new_jobs_count > 0` and no 429 lines.
