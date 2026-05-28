# CLAUDE.md — first2apply (household fork)

> **This file is your cheat sheet.** It is auto-loaded every session so you do NOT
> re-explore the repo from scratch. Trust it first; verify a path only if an edit fails.
> **When you discover a durable structural fact (new key path, changed flow, new gotcha),
> add it here in the same session.** See "Maintaining this file" at the bottom.

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

## Common commands (from repo root)

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Run all dev | `npx nx run-many -t dev` (or `pnpm dev`) |
| Typecheck | `pnpm typecheck` (also runs on pre-push via husky) |
| Test / lint | `pnpm test` / `pnpm lint` |
| Local Supabase + services | `pnpm up` (docker compose) |
| Serve edge fns w/ debugger | `pnpm debug:edge` |

## Where things live (jump table)

- **"Scan is stuck on scanning" / jobs not updating** → `libraries/scraper/src/jobScanner.ts`,
  `scannerSettings.ts` (frequency), `health/`. Check the Pi probe path + Tailscale (quirks 3–4) before code.
- **AI job evaluation / fit scoring** → `apps/backend/supabase/functions/` (OpenAI calls).
- **Desktop UI** → `apps/desktopProbe/src/pages/` + `components/`.
- **Release / changelog** → `CHANGELOG.md`, release-it conventional commits (`chore(release): …`).
- **Decisions / history** → `decisions.md`, `BACKLOG.md`, `troubleshooting/<date>-<slug>/`.

## Maintaining this file

- After any session where you learned a **durable** fact (a path moved, a flow changed, a new
  recurring gotcha), update the relevant section here before finishing. Keep it terse.
- Cross-link to `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/` entries by slug
  rather than duplicating long content.
- Don't dump transient debugging detail here — that belongs in `troubleshooting/<date>-<slug>/`.
