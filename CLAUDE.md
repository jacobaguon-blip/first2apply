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
| "run QA", "qa the merge", "test the UI" | `qa/run-qa.sh unit` (add `ui` for desktop or library changes, `all` for everything). Skill: `f2a-qa` |
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
   - **Always bump the version** before deploying to her machine. `apply-update.sh` compares
     `CFBundleShortVersionString` against `VERSION` and skips if equal — code-only changes
     with the same version are silently ignored.
   - **Remote `open` fails over SSH:** macOS blocks GUI launches from non-interactive SSH.
     The app must be launched locally (dock/Finder) after a remote deploy.
6. **Desktop quits on close (no tray-hide).** The Pi handles scanning, so the desktop app
   quits fully on window close instead of hiding to the system tray.
7. **Supabase cloud project** exists so the desktop app runs on other machines without self-hosting.
   Local Docker stack (`pnpm up`) is dev-only. (memory: `project_supabase_cloud`)
8. **Local AI on the Pi (no API keys).** All AI inference runs on the Pi via **Ollama** (default
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
   - **Build-time gotcha:** any `.env` var that main-process code reads via `process.env.*` must
     also be listed in `apps/desktopProbe/webpack.plugins.ts` `EnvironmentPlugin`. Without it,
     webpack inlines `undefined`, the value is silently lost, and any branch keyed on it gets
     dead-code-eliminated. (`F2A_FUNCTIONS_URL` was the trip-wire here; see session 2026-05-28.)
   - **`.env.deploy-local-backup` foot-gun:** `deploy-local.sh` PUSHOVER scrub creates this backup
     and restores it on next run if a prior run crashed. A stale backup silently overwrites recent
     `.env` edits. If a fresh edit "disappears" after a deploy, check for / delete this file before
     re-editing.
   - Router auth: `_localServer.ts` requires `Authorization: Bearer …` (any non-empty token);
     handlers do the real JWT/service-role validation via `getEdgeFunctionContext`. `/health` is
     exempt. Bind is `0.0.0.0` because the desktop reaches the Pi over Tailscale.
   - Fork-specific: jobs UPSERT into `jobs` table now sets `user_id` explicitly because the DB
     default `auth.uid()` is null for service-role calls (`apps/backend/supabase/functions/scan-urls/index.ts`).
   - Spec + design: `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`.

## Pi ops gotchas (learned 2026-10-07)

- **Pi DNS is pinned and independent of Tailscale.** `/etc/resolv.conf` on the Pi is immutable (`chattr +i`)
  with `192.168.4.1`, `1.1.1.1`, `8.8.8.8`. Old copy: `/etc/resolv.conf.pre-f2a-dns-fix`. Docker copies the host
  resolv.conf at container start, so after any DNS change run `docker restart f2a-edge-local` (the probe restarts
  via systemd). Tailscale key expiry is disabled for `raspberrypi`. LAN fallback: `ssh maadkal@raspberrypi.local`.
- **Probe image ships through CI.** Every push to master runs the Release workflow (ghcr `f2a-server-probe:latest`).
  Roll out with `ssh maadkal@raspberrypi 'bash /opt/first2apply/deploy.sh'` (keeps `:previous` for rollback).
- **Control server for manual scans:** `POST http://127.0.0.1:7879/scan/link/<id>` on the Pi with
  `Authorization: Bearer $F2A_PROBE_SECRET` (read it from `docker inspect f2a-server-probe`, never print it).
- **Scan order:** `libraries/scraper/src/scanOrder.ts` runs non-custom links before slow LLM-parsed custom boards.
- **Migrations:** `create or replace function` with new params makes an overload, not a replacement. Drop the old
  signature in the same migration. After merging a migration run `supabase migration list` (apps/backend) and
  `supabase db push`; the cloud project can silently lag behind master.

## Referral contacts (added 2026-10-08)

- **`company_key` lives in two places** and must change together: `libraries/core/src/companyKey.ts` and the SQL
  function `public.company_key` (migration `20261008000000_referral_contacts.sql`). Verify with
  `node apps/backend/scripts/company-key-parity.mjs` (needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the Pi
  `.env` has both). The key columns on `jobs` and `connections` are STORED generated columns: changing the rules
  needs a migration that drops and re-adds them, not just `create or replace function`.
- **Privacy:** `connections` never stores email. `draft-referral` sends only the contact's first name, position and
  company to the model, never the last name or profile URL. Nothing is ever sent to a contact automatically.
- **Row-level security check:** `node apps/backend/scripts/referral-rls-check.mjs` (also needs
  `SUPABASE_ANON_KEY`, the desktop `.env` `SUPABASE_KEY`). `profiles.user_id` has no cascade, so delete a user's
  `profiles` row before deleting the auth user.
- **Nudge:** daily Pushover reminder for asked outreach whose follow-up date passed. Code in
  `libraries/scraper/src/referralNudge.ts`, scheduled by `apps/serverProbe/src/referralNudge.ts`. Env:
  `F2A_REFERRAL_NUDGE_CRON` (default `0 9 * * *`) and `F2A_REFERRAL_NUDGE_TZ` (default Pi `TZ`, then America/Denver).
- **Drafting speed:** on the Pi's 3B CPU model a draft can queue for many minutes behind scanner parses. See the
  cloud AI provider item in `docs/BACKLOG.md`.

## QA

- `qa/run-qa.sh {fast|unit|ui|all}` (or `pnpm qa:*`). Fails only on NEW failures vs `qa/known-failures.json`. Full guide: `docs/QA.md`, skill `f2a-qa`.
- **Merge rule:** every merge to master needs `unit` green. Changes under `apps/desktopProbe` or `libraries/` also need `ui`.
- Pre-push runs `qa:fast` + `qa:unit` (replaced nx `typecheck`, which already fails on master). `.husky/post-merge` runs `unit` and reminds about `ui`.
- UI tier drives the packaged app (`apps/desktopProbe/out`) through a CDP filter proxy, because `_electron.launch` hangs on the app's hidden helper pages. Isolated `--user-data-dir`, never touches `/Applications`.
- Auth specs need `F2A_QA_EMAIL` + `F2A_QA_PASSWORD` (shell env only) and a build with a real `apps/desktopProbe/.env`. Otherwise they SKIP.

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
- **Location filtering + sort by date** → `libraries/core/src/classifyLocation.ts` is the canonical classifier;
  SQL mirror in migration `apps/backend/supabase/migrations/20260528000000_sort_and_location.sql`
  (function `public.classify_job_location`). The two MUST stay in sync — change them together. The Deno
  edge fn (`apps/backend/supabase/functions/_shared/advancedMatching.ts`) imports the TS helper directly
  from `@first2apply/core`, so there is no third mirror.
- **Desktop UI** → `apps/desktopProbe/src/pages/` + `components/`.
- **Release / changelog** → `CHANGELOG.md`, release-it conventional commits (`chore(release): …`).
- **Decisions / history** → `decisions.md`, `docs/BACKLOG.md` (the only backlog, used by `/feature-bug`), `troubleshooting/<date>-<slug>/`.

## Maintaining this file

- After any session where you learned a **durable** fact (a path moved, a flow changed, a new
  recurring gotcha), update the relevant section here before finishing. Keep it terse.
- Cross-link to `~/.claude/projects/-Users-jacobaguon-Projects-first2apply/memory/` entries by slug
  rather than duplicating long content.
- Don't dump transient debugging detail here — that belongs in `troubleshooting/<date>-<slug>/`.
