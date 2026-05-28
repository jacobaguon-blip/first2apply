# Plan — Local AI on the Pi (A2)

Derived from design spec `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`.

## TL;DR

Eliminate the paid OpenAI dependency (currently failing with 429 quota-exceeded,
blocking all job scanning) by running all AI inference locally on the Raspberry
Pi 5 via Ollama (`qwen2.5:7b`), self-hosting the Supabase Edge Runtime on the Pi
so the existing edge-function logic runs unchanged with only the OpenAI client's
`baseURL` repointed at local Ollama. Everything stays on Tailscale; no public
hosting, no API keys.

## Reasoning (frameworks)

- **Reversibility (two-way door):** the entire cutover is gated behind one env var
  `F2A_AI_PROVIDER` (`local`|`openai`). Flipping back to cloud OpenAI requires no
  code change and no redeploy — only a funded key. This makes the migration a
  reversible door, which is why A2 (config-swap) was chosen over A1 (rewrite).
- **Hyrum's Law:** the edge functions' observable contract (request/response
  shape of `scan-urls`, `scan-job-description`, `evaluate-job`, `parse-cv`,
  `tailor-cv`) is preserved exactly. Clients (probe, desktop) see no contract
  change — only the transport base URL moves from cloud to Pi-over-Tailscale.
- **Gall's Law:** build incrementally from a working simple system. Step 1 proves
  one function against local Ollama (the ARM spike) before any cutover. Scanning
  is migrated first (the blocker); CV/fit endpoints follow only after scanning is
  proven green.

## Artifact / component split

1. **Ollama runtime** (Pi, new Docker service) — `qwen2.5:7b`, bound localhost.
2. **Self-hosted edge runtime** (Pi, new Docker service) — serves existing functions.
3. **`buildOpenAiClient` provider switch** (`apps/backend/supabase/functions/_shared/openAI.ts`) — baseURL/apiKey/model-alias on `F2A_AI_PROVIDER`.
4. **Chunking layer** (`customJobsParser.ts`) — `chunkMarkdown`, replaces 120k truncation; post-merge dedupe + cap; per-chunk schema bound reconciled.
5. **Reliability wrapper** (shared) — Zod-validate → 1 retry → `parseFailed`; per-call timeout.
6. **Client routing** — probe scanner + 4 desktop IPC handlers repointed to Pi runtime over Tailscale; service-role + `F2A_OWNER_USER_ID` auth shim for CV/fit.
7. **Config/deploy** — Pi env vars + compose/systemd wiring so Ollama + runtime start on boot.

## Sprint plan

- **Sprint 0 — ARM spike (de-risk):** install Ollama on Pi, pull `qwen2.5:7b`,
  stand up `supabase/edge-runtime` container serving ONE function (`scan-urls`)
  with baseURL→Ollama, run one real index-page parse. Go/no-go: parse completes
  under timeout ceiling + ≥80% field match vs prior gpt-4o on a 3–5 job spot check.
- **Sprint 1 — provider switch + chunking + reliability wrapper** (components 3,4,5),
  with unit tests for `chunkMarkdown` (split/merge/dedupe/cap) and the retry wrapper.
- **Sprint 2 — wire scanning to local** (component 6, probe side): repoint
  `scanHtmls`/job-description calls to the Pi runtime; confirm jobs land
  (`new_jobs_count > 0`, zero 429s).
- **Sprint 3 — wire CV/fit to local** (component 6, desktop side + auth shim):
  repoint the 4 IPC handlers; verify auth shim writes to the correct owner.
- **Sprint 4 — deploy hardening** (component 7): compose/systemd boot wiring,
  `F2A_AI_PROVIDER` documented, fallback-to-openai verified.

## Out of scope

- Fixing the broken public dynamic-DNS / `first2apply.maadcloud.com` PWA route.
- Any model fine-tuning. Model choice is benchmarked in Sprint 0, not tuned.
- GPU acceleration (Pi 5 has none).
- Migrating data out of cloud Supabase — only inference moves local; `jobs` table
  and auth stay in cloud Supabase.

## Rollback

Set `F2A_AI_PROVIDER=openai` (+ a funded OpenAI key) and restart the probe — all
AI reverts to cloud with no code change. Self-hosted runtime/Ollama containers can
be stopped independently; the cloud edge functions remain deployed as the fallback
target.

## Consumer Inventory (Phase 1.5 audit, 2026-05-27)

### Verified directory locations
- Edge functions: `apps/backend/supabase/functions/` (ls-verified)
- Shared fn code: `apps/backend/supabase/functions/_shared/` (ls-verified)
- Pi runtime app: `apps/serverProbe/` (the `f2a-server-probe` container)
- Scraper lib: `libraries/scraper/src/` (ls-verified)
- Shared API client: `libraries/ui/src/lib/supabaseApi.ts`
- Desktop: `apps/desktopProbe/src/`
- Pi deploy: `deploy/pi/` + `deploy/pi/systemd/` (ls-verified)

### Consumer matrix
| Class | Count | Files (with refs) | Runtime | Notes |
|---|---|---|---|---|
| AI edge fns (call buildOpenAiClient) | 6 | scan-urls(via _shared/customJobsParser.ts, jobListParser.ts), scan-job-description, evaluate-job, parse-cv, tailor-cv, _shared/advancedMatching.ts | deno | The only code that changes provider; baseURL swap centralizes in `_shared/openAI.ts` |
| Shared API client | 1 | libraries/ui/src/lib/supabaseApi.ts (functions.invoke ×4: scanHtmls@149, careerOps@222, scanJobDescription@249, post-scan-hook@274) | node | Used by BOTH serverProbe and desktop — central routing point |
| Pi runtime app | 1 | apps/serverProbe/src/supabaseApi.ts | node | Runs in f2a-server-probe; scanning entry on the Pi |
| Scraper lib | 1 | libraries/scraper/src/jobScanner.ts | node | Orchestrates scan, calls supabaseApi.scanHtmls |
| Desktop IPC | 1 | apps/desktopProbe/src/server/rendererIpcApi.ts (functions.invoke ×4: parse-cv@822, tailor-cv@837, batch-evaluate@868, evaluate-job@888) | node | CV/fit path |
| Desktop UI | 2 | jobDetails.tsx, electronMainSdk.tsx | node/browser | Call IPC, not functions directly — no change |
| Tests | 1 | apps/desktopProbe/src/server/__tests__/jobScanner.test.ts | node | Update if call shape changes |
| Deploy/infra | 5 | deploy/pi/{go-live,bootstrap,deploy}.sh, deploy/pi/systemd/f2a-server-probe.service, deploy/pi/.env.example | bash | Add Ollama + edge-runtime services + env |
| Peer projects | 0 | (AI-journal/changelog-ledger/scaffold-backup hits are logs/docs, not live consumers) | — | No coordinated cross-repo release needed |
| Worktrees | 1 | /Users/jacobaguon/Projects/first2apply/.git only | — | No drift risk |
| PWA (webapp) | 0 | apps/webapp — no AI invocation (auth only) | — | Outside AI path |

### Aggregate
- Total files touched (est.): ~12 (openAI.ts, customJobsParser.ts, jobListParser.ts, supabaseApi.ts ×2, jobScanner.ts, rendererIpcApi.ts, 5 deploy files, +tests)
- Total references: ~20 call sites
- Total codebases: 1 (first2apply monorepo)
- Total runtimes: 2 (node, deno)
