# CLAUDE.md — first2apply (household fork)

> **This file is your cheat sheet.** It is auto-loaded every session so you do NOT
> re-explore the repo from scratch. Trust it first; verify a path only if an edit fails.
> **When you discover a durable structural fact (new key path, changed flow, new gotcha),
> add it here in the same session.** See "Maintaining this file" at the bottom.

## When the user asks for X, run Y (trigger table)

These are automatic — no need to re-ask the user. Confirm any one-way doors
inline (`git push`, posting to anything customer-visible, etc.) but the local
deploy itself is reversible (`.previous.app` rollback path).

| User says (any of) | Run this from anywhere in the repo |
|---|---|
| "deploy the desktop", "ship the changes", "update my app", "rebuild and run", "package and install the new version" | `pnpm --filter first2apply-desktop deploy:local` |
| "deploy to her too", "ship everywhere", "rollout" | `pnpm --filter first2apply-desktop deploy:all` |
| "rollback the desktop", "revert the last deploy" | See `docs/DEPLOY-DESKTOP.md` § Rollback (`.previous.app` swap) |
| "redeploy the Pi local-AI stack", "restart the edge runtime" | `ssh maadkal@raspberrypi 'bash /opt/first2apply-mono/deploy/deploy-local-ai.sh'` |
| "what's the last scan / are jobs landing?" | Query `jobs` table by `created_at` (use Pi `.env` service-role key); check `f2a-edge-local` logs for `[custom] found N jobs` |

The local-deploy script builds the arm64 `.app`, atomically swaps
`/Applications/First 2 Apply.app` (keeping the prior build at `.previous.app`),
strips Gatekeeper quarantine, and launches the new app — all in one command.
Full process + knobs: `docs/DEPLOY-DESKTOP.md`.

## What this is

Open-source job-board aggregator (LinkedIn/Indeed/Dice/…). Upstream: BeastX `first2apply`.
This is a **personal household fork** that diverges from upstream in specific ways (see Fork quirks).
Nx monorepo, pnpm v10, Node 20+. `@beastx/first2apply`.

## Path / symlink gotcha (read first)

- Canonical dir: `/Users/jacobaguon/Projects/first2apply` (capital P).
- `/Users/jacobaguon/projects/first2apply` (lowercase) is a **symlink** to the same place.
  `cwd` may report the lowercase path — it is the same repo, not a second checkout. Don't re-investigate.

## Layout

- `apps/`
  - `backend/` — Supabase: migrations, edge functions (`supabase/functions/`). AI eval lives here.
  - `desktopProbe/` — Electron desktop app (`src/`: `app.tsx`, `pages/`, `lib/`, `server/`).
  - `webapp/` — Next.js web app. `nodeBackend/`, `serverProbe/`, `serverWebUI/` — server-side variants.
  - `landingPage/`, `blog/`, `invoiceDownloader/` — peripheral.
- `libraries/`
  - `scraper/src/` — **job scanning core**: `jobScanner.ts`, `scannerSettings.ts`, `health/`,
    `notifications/`, `pushover.ts`, `types.ts`. Start here for "scans stuck / jobs not updating".
  - `core/`, `ui/` — shared code + components.

## Fork quirks (differ from upstream — do not "fix" toward upstream)

1. **AI provider: vanilla OpenAI, not Azure Foundry.** Edge functions call OpenAI directly.
   Upstream uses Azure. (memory: `project_ai_provider_swap`)
2. **Mezmo/LogDNA is optional.** Both the probe and edge-function loggers are null-safe.
   Upstream's `throwError('')` at module scope causes uncatchable 500s if you reintroduce it.
   (memory: `project_mezmo_optional`)
3. **Raspberry Pi probe over Tailscale.** The fork can run a probe on a Pi reached via Tailscale
   MagicDNS (`raspberrypi`). **If the Pi seems "unreachable," suspect Tailscale being disconnected
   first, not the Pi.** (memory: `feedback_pi_ssh_tailscale`)
4. **Tailscale DNS must stay OFF on this Mac** — it conflicts with Twingate. Use an `/etc/hosts`
   pin for `raspberrypi` (tailnet IP), never enable "Use Tailscale DNS Settings".
   Full RCA: `troubleshooting/2026-05-19-squire-blocked-by-tailscale/`. (memory: `feedback_tailscale_dns_twingate`)
5. **Deploy is push-model, auto-updater stays disabled:** `deploy/` + `scripts/`
   (`publish-release.sh`, `deploy-to-her.sh`). (memory: `project_household_deploy`)
6. **Supabase cloud project** exists so the desktop app runs on other machines without self-hosting.
   Local Docker stack (`pnpm up`) is dev-only. (memory: `project_supabase_cloud`)
7. **Local AI on the Pi (no API keys).** All AI inference runs on the Pi via **Ollama** (default
   model `qwen2.5:3b-f2a`, `num_ctx=16384` via Modelfile) and a **self-hosted Deno edge runtime**
   (`f2a-edge-local` container, port 54321) that imports each function's `handle()` and routes by
   `/functions/v1/<name>`. Provider switch is one env var: `F2A_AI_PROVIDER=local|openai`.
   - Pi files: `/opt/first2apply-mono/` (functions + libs), `/opt/first2apply-mono/deploy/`
     (`compose.local-ai.yaml`, `deploy-local-ai.sh`).
   - Probe wiring: `/opt/first2apply/preload.js` + `NODE_OPTIONS=--require=/preload.js` in
     `/opt/first2apply/.env`; rewrites `${SUPABASE_URL}/functions/v1/*` → local edge, and raises
     undici dispatcher timeout to 30 min for slow CPU parses. Durable in-source version lives in
     `apps/serverProbe/src/main.ts` (activates on next probe image rebuild).
   - Desktop wiring: `apps/desktopProbe/src/index.ts` — same rewriting fetch, gated on
     `F2A_FUNCTIONS_URL`. Activates on next desktop rebuild.
   - Router auth: `_localServer.ts` requires `Authorization: Bearer …` (any non-empty token);
     handlers do the real JWT/service-role validation via `getEdgeFunctionContext`. `/health` is
     exempt. Bind is `0.0.0.0` because the desktop reaches the Pi over Tailscale.
   - Fork-specific: jobs UPSERT into `jobs` table now sets `user_id` explicitly because the DB
     default `auth.uid()` is null for service-role calls (`apps/backend/supabase/functions/scan-urls/index.ts`).
   - Spec + design: `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`.

## Common commands (from repo root)

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Run all dev | `npx nx run-many -t dev` (or `pnpm dev`) |
| Typecheck | `pnpm typecheck` (also runs on pre-push via husky) |
| Test / lint | `pnpm test` / `pnpm lint` |
| Local Supabase + services | `pnpm up` (docker compose) |
| Serve edge fns w/ debugger | `pnpm debug:edge` |
| **Deploy desktop to this Mac** | `pnpm --filter first2apply-desktop deploy:local` |
| **Deploy desktop everywhere** | `pnpm --filter first2apply-desktop deploy:all` |
| Refresh deps before deploy (no postinstall scripts) | `pnpm --filter first2apply-desktop deploy:local:refresh` |
| Deploy Pi local-AI stack | `ssh maadkal@raspberrypi 'bash /opt/first2apply-mono/deploy/deploy-local-ai.sh'` |

## Where things live (jump table)

- **"Scan is stuck on scanning" / jobs not updating** → `libraries/scraper/src/jobScanner.ts`,
  `scannerSettings.ts` (frequency), `health/`. Check the Pi probe path + Tailscale (quirks 3–4) before code.
- **AI job evaluation / fit scoring** → `apps/backend/supabase/functions/` (OpenAI calls).
  - **Filter prompt edits do NOT retroactively re-score old jobs.** `applyAdvancedMatchingFilters`
    runs once per job during `scan-job-description`. The "Re-apply to existing jobs" button on
    the AI Filters page calls the `reapply-filter-profile` edge function to sweep the backlog
    (`new` + `excluded_by_advanced_matching`) — that's the only path that re-evaluates existing jobs.
- **Desktop UI** → `apps/desktopProbe/src/pages/` + `components/`.
- **Release / changelog** → `CHANGELOG.md`, release-it conventional commits (`chore(release): …`).
- **Decisions / history** → `decisions.md`, `BACKLOG.md`, `troubleshooting/<date>-<slug>/`.

## Maintaining this file

- After any session where you learned a **durable** fact (a path moved, a flow changed, a new
  recurring gotcha), update the relevant section here before finishing. Keep it terse.
- Cross-link to `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/` entries by slug
  rather than duplicating long content.
- Don't dump transient debugging detail here — that belongs in `troubleshooting/<date>-<slug>/`.
