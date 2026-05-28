# Morning Report — Local AI on the Pi (overnight build)

Date: 2026-05-28 (overnight session)
Plan: `.claude/plans/2026-05-27-local-ai-on-pi.md`
Spec: `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`

## TL;DR

The OpenAI 429 dependency is **gone**. All AI parsing now runs locally on the
Pi via Ollama + a Deno-hosted edge runtime, reached over Tailscale. Scanning
end-to-end works: the probe calls the local edge runtime, the edge runtime
calls local Ollama, jobs upsert into cloud Supabase. **Pi 5 CPU latency is the
honest constraint** — parses take minutes per dense chunk.

What's running on the Pi now (all `--restart unless-stopped`, all on Tailscale,
no public exposure):

| Container | Status | Purpose |
|---|---|---|
| `ollama` | Up | Local model server, `qwen2.5:3b-f2a` (num_ctx 16384) |
| `f2a-edge-local` | Up | Self-hosted edge runtime (Deno) serving `scan-urls`, `scan-job-description`, `post-scan-hook`, `/health` on :54321 |
| `f2a-server-probe` | Up | Existing probe, now rewriting cloud function calls → local edge via a Node preload |

## What was delivered (committed locally, not pushed)

Five commits on `master`:

1. `docs: local-AI design spec + 429 investigation ledger`
2. `feat(backend): local AI provider switch + HTML chunking + parse retry wrapper`
3. `feat(backend,probe): host edge functions locally on Pi via _localServer router`
4. `fix(scan-urls): explicit user_id on jobs upsert + preload.js for probe wiring`
5. `fix(preload): undici 30-min headers/body timeout for slow Pi 5 LLM parses`

Key files:

- `apps/backend/supabase/functions/_shared/openAI.ts` — provider switch (`F2A_AI_PROVIDER=local|openai`)
- `apps/backend/supabase/functions/_shared/env.ts` — Ollama config
- `apps/backend/supabase/functions/_shared/customJobsParser.ts` — chunking + retry wrapper
- `apps/backend/supabase/functions/_shared/markdownChunker.ts` + `.test.ts` — pure chunker (5/5 tests pass)
- `apps/backend/supabase/functions/scan-urls/index.ts` — exports `handle()`, explicit user_id on insert
- `apps/backend/supabase/functions/scan-job-description/index.ts` — exports `handle()`
- `apps/backend/supabase/functions/_localServer.ts` — Deno router that imports each function's handle and dispatches by `/functions/v1/<name>`
- `apps/serverProbe/src/main.ts`, `env.ts` — durable in-source `F2A_FUNCTIONS_URL` rewriting fetch (lands on next image rebuild)
- `deploy/pi/preload.js` — Node preload bridge that does the same fetch rewrite in the **currently-running** probe image without a rebuild

## Sprint status

| Sprint | State | Notes |
|---|---|---|
| 0 — ARM spike | ✅ done | Ollama installed, qwen2.5:3b/7b + f2a (num_ctx 16384) variants pulled. Quality validated: 5/5 jobs correctly extracted on small test, 15/15 on dense test |
| 1 — Provider switch + chunking + reliability | ✅ done | Code merged + unit tests pass + deno type-check clean |
| 2 — Wire scanning to local | ✅ done (probe-side via preload bridge) | Edge runtime live; probe rewrites function URLs over Tailscale; user_id insert fix landed; LLM parse runs end-to-end on real customer URLs |
| 3 — Wire CV/fit to local | ⏳ not started | Needs the desktop's `parse-cv`/`tailor-cv`/`evaluate-job`/`batch-evaluate-jobs` IPC handlers repointed at the Pi's `f2a-edge-local`. Source change is straightforward; deploys require a desktopProbe image rebuild |
| 4 — Deploy hardening | 🟨 partial | Containers run with `--restart unless-stopped`. Systemd unit patched for `preload.js` mount. **Not yet integrated into compose/deploy.sh** — the `f2a-edge-local` container is one ad-hoc `docker run` away from being lost on a clean redeploy |

## Honest latency reality

Pi 5 CPU benchmarks I observed:

| Model | Chunk size (chars) | Listings | Wall time |
|---|---|---|---|
| `qwen2.5:3b-f2a` | ~5,200 | 5 | ~15s |
| `qwen2.5:3b-f2a` | ~7,800 | 15 (dense) | 877s (~14m37s) |
| `qwen2.5:7b-f2a` | ~7,800 | 15 (dense) | 1214s (~20m14s) |

Production chunk size is 16k chars (defined in
`customJobsParser.ts:PARSE_CHUNK_MAX_CHARS`). Per-chunk timeout is 10 min;
undici (the probe's HTTP client) raised to 30 min globally so legitimate slow
parses are not aborted. A typical careers page lands in 1 chunk; a ~450-listing
page would split into ~5 chunks. With 38 user links, a full scan from cold
will take **hours**, not minutes. The hourly cron may overlap itself; consider
moving cron to `0 */4 * * *` once you confirm rhythm.

If you find this too slow, options (in order of effort):
1. Switch model: `F2A_OLLAMA_MODEL=qwen2.5:3b` (without the f2a-variant context cap) — slightly faster on small chunks.
2. Lower `PARSE_CHUNK_MAX_CHARS` to ~10k for finer parallelism.
3. Move to a smaller-still model (1.5b/2b) — pull via `docker exec ollama ollama pull qwen2.5:1.5b`. Quality risk.
4. Move inference off Pi (Mac Mini, mini PC, GPU box). Same architecture; just change `F2A_OLLAMA_URL` to point at the new host.

## What requires your decision

1. **Push the commits.** Five local commits on `master`. Not pushed (per "commit locally, don't push" overnight rule). Review and `git push` when ready.
2. **Build & deploy the new `f2a-server-probe` image** (durable replacement for the preload bridge). The preload is a perfectly fine shim — it works — but the in-source rewriting fetch (`apps/serverProbe/src/main.ts`) is the long-term home. Run your usual CI release (the changes will land on next push to `master`).
3. **Sprint 3 (CV / fit / tailor)** — green-light to land that work the same way (edit handlers, rsync to Pi, restart edge container). The desktop IPC handlers need pointing at the Pi too, which requires a desktopProbe rebuild.
4. **Deploy hardening:** decide whether to add `ollama` and `f2a-edge-local` to a managed compose (suggest extending `deploy/pi/compose.standby.yaml`) and have `deploy/pi/deploy.sh` start/restart them. Today they're started with bare `docker run` commands and survive reboots only via Docker's `--restart` policy.

## Rollback

`F2A_AI_PROVIDER=openai` (in `/opt/first2apply-mono/apps/backend/supabase/functions/.env`) + a funded `OPENAI_API_KEY` reverts AI to cloud OpenAI without code change. Restart the edge container: `docker restart f2a-edge-local`. The preload bridge can be disabled by removing `NODE_OPTIONS` from `/opt/first2apply/.env` and restarting `f2a-server-probe.service`.

## What to verify in the morning

```bash
# Are jobs landing now?
ssh maadkal@raspberrypi 'URL=$(sudo grep ^SUPABASE_URL= /opt/first2apply/.env | cut -d= -f2); KEY=$(sudo grep ^SUPABASE_SERVICE_ROLE_KEY= /opt/first2apply/.env | cut -d= -f2); SINCE=$(date -u -d "12 hours ago" +%Y-%m-%dT%H:%M:%SZ); curl -s -I "$URL/rest/v1/jobs?select=id&created_at=gte.$SINCE" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" | grep -i content-range'

# Edge runtime healthy?
curl http://raspberrypi:54321/functions/v1/health

# Local AI footprint?
ssh maadkal@raspberrypi 'docker ps --filter name=ollama --filter name=f2a-edge-local --filter name=f2a-server-probe'

# Latest probe scan complete?
ssh maadkal@raspberrypi 'docker logs --since 6h f2a-server-probe 2>&1 | grep scan_links_complete | tail -3'
```
