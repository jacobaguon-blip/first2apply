# Devil's Advocate Analysis — Local AI on the Pi (pass 1)

Plan: `.claude/plans/2026-05-27-local-ai-on-pi.md`
Spec: `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`

## Executive Summary

The plan is structurally sound — provider switch behind one env var, A2 over A1
to preserve parse logic, Ollama on Pi, edge-runtime self-hosted. The reversibility
story is real. **But the plan is over-confident about three things that Murphy
will exploit:** (1) a 7B model on CPU producing reliable structured JSON across
messy HTML at acceptable latency, (2) `supabase/edge-runtime` running cleanly on
ARM64 with no surprises, and (3) the auth shim doing the right thing when a
multi-user desktop history hits a single `F2A_OWNER_USER_ID`. Below: **3 HIGH,
6 MEDIUM, 4 LOW** issues. None are blocking the Sprint 0 spike — they ARE the
reasons Sprint 0 must gate hard before Sprint 1.

## High Issues

### H1. Sprint 0 go/no-go threshold ("≥80% field match on 3–5 jobs") is statistically meaningless

**File:** plan §Sprint 0; spec §Rollout step 1; §Verification
**Bug:** A 3–5 job spot-check at 80% is 12–20 fields total. Random chance can
clear this; one well-formatted Greenhouse-ish page can clear this while LinkedIn
fails. The threshold is also "vs prior gpt-4o output" — but the prior output is
not currently being captured anywhere as a frozen baseline (OpenAI returns 429),
so the comparison is to *memory* or to whatever stale rows still exist in `jobs`.
**Impact:** Sprint 0 will green-light a model that fails on the messy 80% of
real index pages. Plan advances to Sprint 1; chunking + reliability wrapper get
built on top of a model that can't hold the schema. The "silently degrading
parse quality" risk the spec calls out as A2's whole reason for winning over A1
is exactly what this threshold fails to detect.
**Fix:** Before Sprint 0, capture a frozen baseline corpus: ≥3 saved HTML
snapshots per *distinct* site class (LinkedIn search, Indeed search, Dice,
Greenhouse-fronted, "custom" — i.e. the actual `parseCustomJobs` path). Score on
≥20 jobs total, per-field, with the rubric named explicitly (exact-match title +
url, fuzzy-match company, presence-check location). Threshold: ≥90% on
title+url (the keys that drive dedupe), ≥75% on company/location. Anything less
and the cap-relocation + chunking work in Sprint 1 is premature.

### H2. Removing `MAX_CONTENT_CHARS` while replacing it with chunking inverts the failure mode from "truncate silently" to "OOM / runaway latency silently"

**File:** plan §Artifact split #4; spec §Components #4 "Truncation reconciliation"
**Bug:** Today, a 5MB index page is sliced to 120k chars — bounded, fast, lossy.
Post-change, the same page is chunked end-to-end. With `maxChars`≈40k and a 5MB
page, that's ~125 chunks × 180s ceiling = **6.25 hours** for one URL. The
scanner runs hourly. There is no upper bound on total chunks per page and no
total-page timeout — only per-chunk.
**Impact:** A single pathological page (an infinite-scroll dump, a misconfigured
site returning the same listings repeated, an attacker-controlled custom URL)
stalls the hourly scan indefinitely. The "no listings silently dropped"
guarantee becomes "no scan ever completes."
**Fix:** Keep an outer cap. Two-layer: a `maxChunks` (e.g. 8–12, tuned so the
post-merge `slice(0, 30)` is still achievable from realistic pages) **and** a
per-page wall-clock timeout that hard-fails to `parseFailed` rather than hanging.
Document explicitly: "we are choosing bounded loss over unbounded latency."
The current spec language ("no listings silently dropped") needs to be softened
to match.

### H3. `F2A_OWNER_USER_ID` shim assumes the desktop has exactly one user — and the verification only checks "writes to the owner"

**File:** plan component #6 auth shim; spec §Verification "Auth shim correctness"
**Bug:** The shim resolves *every* CV/fit request, regardless of which desktop
issued it, to the single configured owner. If the household ever runs the
desktop on a second machine (spouse, secondary account), or if an old laptop
still has a logged-in session against cloud Supabase, calls routed to the Pi
runtime will silently overwrite or attribute work to the configured owner.
There's no assertion that the incoming bearer (`F2A_PROBE_SECRET`) actually
*came from* the configured owner — the secret is shared infra auth, not user
identity. Cloud Supabase enforced this with the JWT; the local runtime drops
that enforcement.
**Impact:** Wrong-user writes are silent data corruption — exactly the failure
mode flagged in `troubleshooting/2026-05-19-squire-blocked-by-tailscale/`-class
incidents (silent, not loud). The verification step as written
("writes to owner, not wrong/empty user") would pass even in a 2-user scenario
because there's no other user to *attribute* to.
**Fix:** Make the shim refuse to start unless `F2A_OWNER_USER_ID` is set AND
either (a) the household is documented as single-user (add a CLAUDE.md line),
or (b) the desktop adds a header (`X-F2A-Caller-User-Id`) cross-checked against
an allowlist. At minimum, log every CV/fit call with the *intended* user
(from desktop) vs. the *resolved* user (from shim) so a mismatch is visible.

## Medium Issues

| # | Issue | File / spec ref | Impact | Fix |
|---|---|---|---|---|
| M1 | No reconciliation of `qwen2.5:7b` Ollama context window vs `maxChars` ≈40k chars (~10k tokens). `qwen2.5:7b` default context is 32k but Ollama defaults `num_ctx` to **2048** unless overridden. | spec §4 chunking + §Configuration | Every chunk silently truncated by Ollama; chunking math is moot; quality collapses with no error. | In Sprint 0, explicitly set `num_ctx` via Ollama options (Modelfile or per-request) and *verify* with a long-prompt echo test before benchmarking parse quality. Pin the value in `F2A_OLLAMA_*` env. |
| M2 | "Stale Azure OpenAI log line cleaned up" buried in component #3 risks re-triggering the `throwError('')` Mezmo footgun the fork already paid for. | spec §3; memory `project_mezmo_optional` | If "cleanup" touches the logger and reintroduces upstream's module-scope `throwError('')`, edge functions 500 uncatchably. | Out-of-band: review the cleanup diff explicitly against `project_mezmo_optional` before merge. Add a regression test that imports the logger with `MEZMO_*` env unset. |
| M3 | No plan for Ollama model storage / Pi disk pressure. `qwen2.5:7b` ≈ 4.7GB; quant variants more. Pi 5 SD card capacity not stated. | spec §1 Ollama | Pull fails mid-deploy, or fills disk and takes down maadcloud Caddy / probe logs. | Pre-flight: document required free space, fail bootstrap script if `df` shows <10GB free before pull. Decide model storage path (SSD vs SD). |
| M4 | "Cloud fallback retained" requires the cloud edge functions to stay deployed and in-sync with whatever lives on the Pi. Plan changes `_shared/openAI.ts` and `customJobsParser.ts` — those changes need to ship to cloud too, or the fallback is broken-or-divergent. | plan §Rollback; spec §Fallback | `F2A_AI_PROVIDER=openai` flip "just works" today only if the cloud copy was redeployed with the new code. If cloud is stale, the fallback returns different results than the local path. | Either (a) deploy `_shared/openAI.ts` + `customJobsParser.ts` changes to cloud Supabase in Sprint 1 too, or (b) explicitly document the fallback as "code-state matches whichever side was last deployed; not symmetric." |
| M5 | No backoff between retries; the reliability wrapper does "1 retry with a reminder." If Ollama is OOM/swapping, retry hits the same condition and burns the per-chunk timeout twice. | spec §5 reliability wrapper | Doubles worst-case page latency under degraded conditions and pushes the H2 unbounded-latency problem further. | Add a small fixed delay (e.g. 2s) and an Ollama-health probe between attempts; if Ollama is unhealthy, fail fast to `parseFailed` rather than retrying. |
| M6 | Sprint 0 spike is "one function" but spec lists 5 AI tasks with very different prompt shapes/lengths (index parse, JD parse, fit eval, CV parse, CV tailor). Validating one says nothing about the others — especially CV tailor (longest output) and fit eval (most structured). | plan §Sprint 0; spec §Rollout 1 | Sprint 0 greenlights advancement; Sprints 2–3 discover CV tailor is unusable at minute 0 of rollout. | Sprint 0 benchmarks **all 5 task shapes** with one realistic input each. Cheaper to find this now than to discover in Sprint 3 that the model fails on CV tailor and Sprint 2 work has to be unwound. |

## Low Issues

| # | Issue | Fix |
|---|---|---|
| L1 | Sprint plan has no calendar / effort estimate per sprint. "Mostly infra/config" is hand-wavy for ARM container debugging. | Even rough day-ranges per sprint so slip is visible. |
| L2 | Plan doesn't say where Ollama + edge-runtime logs go. Default Docker stdout fills `journald`; Pi has finite log capacity. | Decide: stdout+`journald` with rotation, or file with logrotate. Documented in deploy config. |
| L3 | "Greenhouse fast-path stays first" — verify the fast-path *detection* doesn't itself call the model. (It currently doesn't, but adding chunking near it invites a regression.) | Add a unit test asserting Greenhouse URLs never reach `chunkMarkdown` or the OpenAI client. |
| L4 | The spec rejects A1 partly on "Deno not strategic." But running a Deno container on the Pi is a new long-lived ops burden the household didn't have before. Worth naming, not re-litigating. | One-line note in plan §Out of scope: "Operating a Deno runtime on the Pi is accepted ongoing cost." |

## Murphy's Law Audit Highlights

- **Worst-case timing:** A new model deploys (Sprint 0) the same day a recruiter
  posts in a format nobody's seen. Sprint 0 spot-check passes on yesterday's
  page class, fails next morning on new one. → mitigated by H1 fix (diverse
  baseline corpus).
- **Compounding:** Pi reboots (power blip / kernel update) while a scan is
  mid-flight. Ollama cold-loads the 4.7GB model from disk (~30–60s on Pi 5
  storage) while edge-runtime is already accepting requests → first N requests
  per-chunk-timeout. Existing `parseFailed` handles it, but the *whole hour's*
  scan returns zero jobs and there's no alert. → add a startup probe that
  blocks edge-runtime from accepting traffic until Ollama answers a warm-up
  request.
- **Human error:** `F2A_AI_PROVIDER=openai` typo (`opena1`, `OpenAI`) — does the
  switch fail loud or silently default to one path? Spec implies a string
  compare; should be enum-validated at boot.
- **Recovery creates new failures:** Falling back to OpenAI requires "a funded
  key." If the household forgot to refund and the Pi runtime is also down,
  fallback fails too. → document a known-good cached parse path or a "scanner
  paused" UX state, not just "flip the env var."

## Remediation Plan

### Before Sprint 0 starts (½ day)
- **H1:** Capture frozen HTML baseline corpus (≥20 jobs across ≥5 site classes)
  with current production parse output snapshotted alongside, before the spike.
- **M3:** Pre-flight disk-space check in bootstrap script.
- **M1:** Add `num_ctx` echo test to the spike script.

### Sprint 0 (extend scope)
- **M6:** Benchmark all 5 AI task shapes, not just `scan-urls`. One realistic
  input each, latency + quality recorded.
- **H1:** Score against the baseline corpus from above. Documented per-field
  hit/miss table is the go/no-go artifact.

### Sprint 1 (add)
- **H2:** Add `maxChunks` cap + per-page wall-clock timeout to the chunking
  layer. Test: pathological 5MB markdown returns `parseFailed` within N seconds.
- **M5:** Add inter-retry health probe to the reliability wrapper.
- **M2:** Logger-cleanup diff reviewed against `project_mezmo_optional`; add the
  unset-env regression test.

### Sprint 3 (add)
- **H3:** Auth-shim logs intended-vs-resolved user; CLAUDE.md or env-allowlist
  decision pinned before any Pi-routed CV/fit call writes a row.
- **M4:** Either redeploy the changed `_shared/openAI.ts` + `customJobsParser.ts`
  to cloud, or amend the rollback doc to state fallback is non-symmetric.

### Sprint 4 (add)
- **Murphy item:** Edge-runtime gated on Ollama warm-up probe before accepting
  traffic.
- **L1/L2:** Log destinations + rotation + rough effort/calendar pinned.

## Success criteria

A fix is "fixed" only when:
- H1: A per-field scoring table exists, committed under
  `troubleshooting/2026-05-27-jobs-not-landing-openai-429/` (or sibling dir),
  reproducible by re-running a script against the baseline corpus.
- H2: An adversarial unit test (5MB synthetic markdown) returns `parseFailed`
  within a documented wall-clock budget. CI runs it.
- H3: A log line on every CV/fit Pi call shows intended user (from desktop) ≠
  null and matches resolved user, OR the call is rejected. Verified by an
  integration test that fakes a second user.

---

(Pass 1 — issues classified by severity, remediation mapped onto existing
sprints. Recommend a pass 2 only after the baseline corpus (H1) exists, since
several mediums are downstream of whether the model actually holds the schema.)
