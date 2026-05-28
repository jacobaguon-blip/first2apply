# Local AI on the Pi — Design

Date: 2026-05-27
Status: Draft (pending review)

## Problem

Job scanning stopped landing new jobs ~1 week ago. Root cause (validated, see
`troubleshooting/2026-05-27-jobs-not-landing-openai-429/hypothesis-ledger.md`):
the cloud Supabase `scan-urls` edge function calls **OpenAI** to parse job HTML,
and the OpenAI account is out of quota — every parse returns HTTP 429, so every
hourly scan completes with `new_jobs_count: 0`. The scraping infrastructure (Pi
cron, probe, downloads) is healthy; only the AI parse step fails.

## Goal

Eliminate the dependency on the paid OpenAI API by running **all** AI inference
locally on the Raspberry Pi 5 (16 GB RAM), with no API keys. Decision (confirmed
with owner): full migration of all AI tasks; do **not** restore the OpenAI key as
an interim — scanning stays down until local is working.

AI tasks in scope: job-index parsing (`scan-urls` → `customJobsParser`), job
description parsing (`scan-job-description`), fit evaluation (`evaluate-job`,
`advancedMatching`), CV parsing (`parse-cv`), CV tailoring (`tailor-cv`).

## Constraints (validated)

- All AI runs in **cloud Supabase edge functions** today. The Pi probe and the
  desktop both invoke them over HTTPS. A cloud edge function cannot reach a model
  on the home network.
- Pi 5: 16 GB RAM, aarch64, **no GPU**, no Ollama installed. CPU inference only —
  slow but acceptable for hourly batch scans.
- The edge functions import only standard `npm:`/`jsr:`/`deno.land` deps on
  Deno 2; `@supabase/supabasefork` is an alias to `npm:@supabase/supabase-js@2.48.1`
  (not an actual fork) — no obstacle to self-hosting.
- Functions expect an authenticated `User`. The probe scanner already supplies one
  via service-role + `F2A_OWNER_USER_ID`; CV/fit functions currently rely on the
  desktop's logged-in JWT and will need the same shim when self-hosted.
- **Networking: Tailscale only.** No public hosting / dynamic DNS / port-forward
  required (validated below).

## Chosen approach: A2 — self-host the Supabase Edge Runtime on the Pi

Run the `supabase/edge-runtime` Docker image on the Pi serving the **existing,
unchanged** functions. The only logic change is in `buildOpenAiClient`
(`apps/backend/supabase/functions/_shared/openAI.ts`): point `baseURL` at local
Ollama and `apiKey` at a dummy. Clients (probe + desktop) send function calls to
the Pi's local runtime instead of cloud Supabase.

### Rejected alternative: A1 — port logic into the Node probe

Rewrite `customJobsParser` / eval / tailor in the probe's Node codebase
(`deno-dom`→`jsdom`/`cheerio`, keep `turndown`), call Ollama directly.

| | A2 (chosen) | A1 (rejected) |
|---|---|---|
| Reuses tuned parsing logic | Yes, verbatim | No — ~600 LOC rewrite in a 2nd language |
| Logic-drift risk | Near zero | High (prompts, schemas, DOM differences) |
| Provider swap surface | One line (`baseURL`) | Whole new codepath |
| Cloud fallback retained | Trivial (same functions) | Needs 2 copies |
| New moving parts | +1 Deno container | None (pure Node) |
| Effort type | Mostly infra/config | Risky rewrite + parity testing |

A2 wins because the dominant risk is **silently degrading parse quality**, which
A1 maximizes and A2 avoids. A1 would only win if the edge runtime proves flaky on
ARM, or if dropping Deno from the stack becomes a strategic goal.

## Networking topology (Tailscale-only, validated)

- Only the **Pi probe** (calls happen on the Pi, `localhost` — no network) and the
  **desktop app** (reaches the Pi over Tailscale today at `raspberrypi:7879`,
  MagicDNS → `100.93.137.31`) ever call AI functions.
- The **PWA (`apps/webapp`) does not use AI** — it only uses Supabase for auth
  (anon key). Phones/browsers are entirely outside the AI path.
- The broken public route (`first2apply.maadcloud.com`; Caddy binds `:80/:443`,
  no tunnel container found) affects only the public PWA and is unrelated to this
  design.
- Ollama and the edge runtime bind to the tailnet / localhost on the Pi, reached
  via MagicDNS — the same proven path the probe already uses. No public exposure.

## Components

### 1. Ollama (new)
- Docker container on the Pi (ARM64), model `qwen2.5:7b`, listening
  `127.0.0.1:11434` (localhost/tailnet only).
- Added to the Pi deploy scripts and systemd/compose so it starts on boot.

### 2. Self-hosted edge runtime (new)
- `supabase/edge-runtime` container on the Pi serving the existing functions,
  version-aligned to the cloud project (`deno_version = 2`).
- Fronted by the probe's existing bearer-secret auth pattern; bound to the tailnet.

### 3. `buildOpenAiClient` provider switch (changed)
- `apps/backend/supabase/functions/_shared/openAI.ts`: `baseURL` →
  `http://<ollama-host>:11434/v1`, `apiKey` → `"local"` when
  `F2A_AI_PROVIDER=local`. Model alias table maps `gpt-4o`/`gpt-4o-mini` → the
  local model so call sites are unchanged. Stale "Azure OpenAI" log line cleaned up.

### 4. Chunking layer (new — `parseCustomJobs` only)
- After the existing strip→turndown step, if content exceeds a safe token budget
  (~8–12k tokens), split on listing boundaries into chunks.
- Parse each chunk against the existing `PARSE_JOBS_PAGE_SCHEMA`; merge + dedupe by
  `externalUrl`, preserve order, keep the existing max-30 cap.
- Greenhouse fast-path stays first — ATS pages never hit the model.

### 5. Reliability wrapper (new — shared)
- Each model call: validate output with the existing Zod schema → one retry with a
  "return valid JSON only" reminder → on second failure, record a parse error via
  the existing `parseFailed` path. No infinite hangs (explicit per-call timeout).

### 6. Client routing (changed)
- Probe: scraper's `scanHtmls` / job-description calls → local runtime
  (`localhost`). Functions still use the service-role client to read/write the
  cloud `jobs` table — **only inference moves local; data stays in cloud Supabase**.
- Desktop: the four IPC handlers (`parse-cv`, `tailor-cv`, `evaluate-job`,
  `batch-evaluate-jobs`) switch from cloud `supabase.functions.invoke` to the Pi's
  Tailscale address, reusing `F2A_PROBE_URL` / `F2A_PROBE_SECRET`.
- Auth shim added to CV/fit functions: service-role + `F2A_OWNER_USER_ID`.

## Configuration

New Pi env:
- `F2A_AI_PROVIDER` = `local` | `openai` (default `local`)
- `F2A_OLLAMA_URL` (e.g. `http://127.0.0.1:11434/v1`)
- `F2A_OLLAMA_MODEL` (e.g. `qwen2.5:7b`)
- `OPENAI_API_KEY` still honored when `F2A_AI_PROVIDER=openai` (instant revert).

## Rollout

1. Ollama up + model pulled + benchmark one real parse (timing + quality).
2. Edge runtime container serving functions locally.
3. Flip scanning to local; confirm jobs land.
4. Flip the three CV/fit endpoints.
5. Decommission reliance on the OpenAI key.

## Fallback

`F2A_AI_PROVIDER=openai` reverts all AI to cloud OpenAI without redeploying code
(requires a funded key). This optionality is the main reason A2 was chosen.

## Verification

- Manual scan → `new_jobs_count > 0`, zero 429s in `f2a-server-probe` logs.
- One fit eval + one CV tailor succeed end-to-end from the desktop over Tailscale.
- Quality spot-check: 3–5 jobs parsed locally vs. prior gpt-4o output.

## Open risks

- **Local 7B structured-output reliability** on messy HTML — mitigated by the
  retry wrapper + chunking, but quality must be validated in step 1, not assumed.
- **Edge-runtime on ARM** — de-risk with a ~30 min spike (one function against
  local Ollama) before full build.
- **CV-tailoring latency** on CPU may be sluggish (interactive use); acceptable
  per owner, revisit model size if intolerable.
