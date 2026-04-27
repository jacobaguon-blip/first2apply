# Master Reconciliation Audit

**Date:** 2026-04-26
**Local master tip:** `bed6b0e chore: opt out of ~/.claude auto-commit hook for this repo`
**Remote master tip:** `7e97a90 fix: update supported models and default model in OpenAI client`
**Commits ahead:** 194 (193 of which are auto-commit-hook noise: `update: <file>`)
**Total real diff:** ~4,647 insertions, ~458 deletions across 57 files

The 194 commits are mostly noise but the **diff is real** — months of feature work the user accumulated locally without ever cleanly pushing. Auto-commit hook now silenced via `.no-auto-commit` marker; this report identifies what to do with the existing 194 commits.

---

## Recommended action

**Squash + restructure into ~10 logical commits, then force-push to `origin/master`.** Force-push is acceptable here because:
1. `origin/master` is the user's **personal fork** (`jacobaguon-blip/first2apply`) — no co-contributors who'd lose work.
2. The 194-commit history is unreadable; one feature per commit is dramatically easier to review.
3. `git diff origin/master..master` is preserved; only the path through the DAG changes.

**WARNING: this is a one-way door.** The user must approve before any `git push --force` happens. Until then, work continues against local master.

---

## Feature inventory (what the 4,647 lines actually contain)

### 1. AI Filter Profiles feature (primary unmerged work)
The big one — a full feature add: filter profiles backed by ChatGPT, ownership migrations, UI, edge-function integration.

| File | LoC | Purpose |
|---|---|---|
| `apps/backend/supabase/migrations/20260424000000_ai_filter_profiles.sql` | +44 | Schema: `ai_filter_profiles` table |
| `apps/backend/supabase/migrations/20260424100000_filter_profile_ownership_check.sql` | +36 | RLS / ownership validation (this migration was renamed to `20260425000000_*` in WIP — see decisions.md drift entry) |
| `apps/backend/supabase/functions/_shared/advancedMatching.ts` | +125 | Edge fn ChatGPT-driven match logic |
| `apps/backend/supabase/functions/_shared/openAI.ts` | +32 | OpenAI client (already swapped from Azure per `project_ai_provider_swap` memory) |
| `apps/desktopProbe/src/pages/filters.tsx` | +610 | Filter profile editor UI (`ProfileEditor` component, etc.) |
| `apps/desktopProbe/src/components/createCompanyTarget.tsx` | +165 (new) | Company-targeting picker |
| `docs/plans/2026-04-24-ai-filter-profiles.md` | +142 | Design doc |
| `libraries/ui/src/lib/supabaseApi.ts` | +158 | Client API for filter profiles |
| `libraries/core/src/sdk.ts` | +50 | SDK additions |
| `libraries/core/src/types.ts` | +35 | `AiFilterProfile` type, RPC signatures |

**Recommendation:** one big commit `feat: AI filter profiles (OpenAI-driven job filtering)` — all of the above. The migration rename is handled separately (see `chore/migration-drift-recovery`).

### 2. Pi / household deployment scaffolding
The Pi-targeted Electron build that the BACKLOG item 4 (server foundation) was meant to build on top of.

| File | Purpose |
|---|---|
| `apps/desktopProbe/.env.pi.example` | Pi env template |
| `apps/desktopProbe/Dockerfile.pi` | Pi image build |
| `apps/desktopProbe/README.pi.md` | Deploy guide |
| `apps/desktopProbe/docker-compose.pi.yml` | Compose for Pi |
| `apps/desktopProbe/packagers/household/install-on-target.sh` | Installer script (also currently has +x mode change in WIP) |
| `apps/desktopProbe/packagers/household/update.sh` | Updater (also +x mode change) |
| `apps/desktopProbe/packagers/household/publish-release.sh` | Release publisher |
| `apps/desktopProbe/packagers/household/com.first2apply.updater.plist` | macOS LaunchAgent |
| `apps/desktopProbe/scripts/kill-dev.sh` | Dev kill script (+x mode change) |
| `apps/desktopProbe/forge.config.ts` | electron-forge config tweaks |

**Recommendation:** one commit `feat(deploy): Pi/household packaging scaffolding`.

### 3. Greenhouse ATS parser
A new site parser added independently of other features.

| File | LoC |
|---|---|
| `apps/backend/supabase/functions/_shared/parsers/greenhouseAts.ts` | +85 (new) |

**Recommendation:** one commit `feat(parsers): Greenhouse ATS site parser`.

### 4. Logger nullsafing (per `project_mezmo_optional` memory)
Both probe and edge-function loggers made null-safe so missing `MEZMO_API_KEY` doesn't 500 at module-scope.

| File | LoC |
|---|---|
| `apps/backend/supabase/functions/_shared/logger.ts` | +41 |
| `apps/desktopProbe/src/server/logger.ts` | +98 |
| `apps/backend/supabase/functions/_shared/env.ts` | +9 |
| `apps/backend/supabase/functions/scan-urls/index.ts` | +31 |

**Recommendation:** one commit `chore(logger): make Mezmo/LogDNA optional in probe + edge functions`.

### 5. Pushover notifications scaffolding
Pre-weekend pushover client (the weekend's `backlog/03-pushover-audit` builds on this).

| File | LoC |
|---|---|
| `apps/desktopProbe/src/server/pushover.ts` | +27 (new) |

**Recommendation:** one commit `feat(notifications): pushover client (notifications scaffolding)`.

### 6. Quiet hours design docs (no implementation — went to cloud directly)
Design + plan docs the user wrote before cloud-side implementation landed.

| File |
|---|
| `docs/plans/2026-04-24-ai-filter-profiles.md` (already counted in §1) |
| `docs/superpowers/plans/2026-04-24-quiet-hours.md` (1102 lines) |
| `docs/superpowers/specs/2026-04-24-quiet-hours-design.md` (172 lines) |

**Recommendation:** one commit `docs: quiet hours design + plan`.

### 7. Misc UI / probe wiring
Smaller cleanups across many files; tied to filter profiles or general polish.

| File | LoC |
|---|---|
| `apps/desktopProbe/src/components/createLink.tsx` | +77 |
| `apps/desktopProbe/src/components/editLink.tsx` | +7 |
| `apps/desktopProbe/src/components/linksList.tsx` | +92 |
| `apps/desktopProbe/src/lib/electronMainSdk.tsx` | +105 |
| `apps/desktopProbe/src/lib/types.ts` | +4 |
| `apps/desktopProbe/src/pages/links.tsx` | +77 |
| `apps/desktopProbe/src/pages/settings.tsx` | +205 |
| `apps/desktopProbe/src/server/autoUpdater.ts` | +5 |
| `apps/desktopProbe/src/server/jobScanner.ts` | +79 |
| `apps/desktopProbe/src/server/overlayBrowserView.ts` | +104 |
| `apps/desktopProbe/src/server/rendererIpcApi.ts` | +81 |
| `apps/desktopProbe/src/server/supabaseConfig.ts` | +52 (new) |
| `apps/desktopProbe/src/index.ts` | +47 |
| `apps/desktopProbe/src/env.ts` | +5 |
| `apps/desktopProbe/package.json` | +4 |
| `apps/webapp/src/lib/sdk.ts` | +41 |
| `libraries/ui/src/hooks/useLinks.tsx` | +9 |

**Recommendation:** ideally split into 2–3 commits by feature (filter-profile-related vs. unrelated polish). Worst-case fallback: one bundled commit `chore(probe): UI + IPC + SDK wiring for filter profiles + misc polish`. Splitting requires manual review — defer to user.

### 8. Schema & seed migrations (pre-existing on origin/master? verify)
| File |
|---|
| `apps/backend/supabase/migrations/20260418000000_initial_schema.sql` (419) |
| `apps/backend/supabase/migrations/20260418000001_seed_sites.sql` (28) |
| `apps/backend/supabase/migrations/20260418000002_household_unlimited_trial.sql` (13) |
| `apps/backend/supabase/migrations/20260419000000_links_scan_frequency.sql` (5) |

⚠️ **These show up in the diff against `origin/master`, suggesting they aren't on the remote at all.** That's strange — cloud already has them applied (verified via `migration list --linked`). Likely they were committed locally and never pushed. **They MUST go in the same commit as the cloud-aligned files** in `chore/migration-drift-recovery` (`20260424120000_quiet_hours.sql`, `20260424120001_claim_summary_send.sql`).

**Recommendation:** one commit `feat(db): all migrations through 20260424120001 (cloud-aligned)` — bundles all unpushed migrations including the drift-recovery files.

### 9. Configuration / metadata
| File | Notes |
|---|---|
| `.gitignore` | already squashed onto master as `8e1f3bb` |
| `.no-auto-commit` | already squashed as `bed6b0e` |
| `BACKLOG.md` (+14) | Already on remote? Verify; if not, ship in chore commit |
| `CHANGELOG.md` (+202) | **Pure auto-commit hook noise — should be reverted, not pushed.** |
| `apps/backend/supabase/config.toml` | minor cleanup |
| `apps/backend/supabase/functions/.env.example` | new env vars added |

**Recommendation:**
- One commit `chore: BACKLOG + config + .env.example updates` (excluding CHANGELOG.md noise).
- One commit `chore: revert auto-commit-hook generated CHANGELOG.md` (deletes the noise file or restores upstream's CHANGELOG).

---

## Proposed clean linear history (10 commits)

If user approves the force-push, the new linear history on `origin/master` should be (atop current `7e97a90`):

```
1. feat(db): all migrations through 20260424120001 (cloud-aligned)
2. chore(logger): null-safe Mezmo / LogDNA in probe + edge functions
3. feat(parsers): Greenhouse ATS site parser
4. feat(notifications): pushover client scaffolding
5. feat(filters): AI filter profiles — full stack (UI + edge fn + types + docs)
6. feat(deploy): Pi / household packaging scaffolding
7. docs: quiet hours design + plan
8. chore(probe): UI / IPC / SDK wiring + misc polish (~17 files)
9. chore: BACKLOG + config + .env.example updates
10. chore: opt out of ~/.claude auto-commit hook (.no-auto-commit + .gitignore)
```

CHANGELOG.md auto-noise gets dropped entirely; the auto-commit-hook entries don't add reviewable signal.

---

## Migration rename status

`20260424100000_filter_profile_ownership_check.sql` (in this branch) ↔ `20260425000000_filter_profile_ownership_check.sql` (in `wip/pre-weekend-snapshot`) is the rename that triggered drift discovery. Per `decisions.md`:
- The `0424100000` timestamp is fine in this audit (origin/master doesn't have it).
- The `0425000000` rename was a WIP-branch decision that should NOT land on master until the user confirms it.
- **For the proposed history above: keep `20260424100000_*` (original name), drop the WIP rename.** This means `wip/pre-weekend-snapshot` and the migration-drift-recovery branch are no longer needed once master is reconciled.

---

## Risks of force-push

1. **PR branches based on local master.** `chore/typecheck-fixes`, `chore/migration-drift-recovery`, `chore/weekend-tooling`, `backlog/01..12-*`, `weekend/integration` — all branched off various points of local master. After force-push:
   - Branches based on the latest local master (`bed6b0e`) will need rebasing.
   - The already-clean `backlog/NN-*` branches branched off `8e1f3bb` (now obsolete) — they need rebasing onto whichever new commit corresponds.
2. **Nothing should be lost** — every diff in those branches is preserved as new commits or rebased branches.
3. **Anything currently in CI on origin/<branch>** would need a force-push of those branches too. None exist remotely yet (we never pushed any of them after the early item 1 attempt was rolled back).

**Mitigation plan if user approves:**
1. Tag the current local master as `backup/master-pre-reconciliation`.
2. Soft-reset to `origin/master`.
3. Stage chunks per the 10-commit proposal above (manual review per commit).
4. Force-push.
5. Rebase each `backlog/NN-*`, `chore/*`, `weekend/integration` onto new master via `git rebase master`.

---

## Status when this audit was written

- ✅ BLOCKER #1 (cloud migration drift) — `chore/migration-drift-recovery`
- ✅ BLOCKER #2 (typecheck) — partially fixed on `chore/typecheck-fixes`; deeper Supabase types regen deferred
- ✅ BLOCKER #9 (auto-commit hook noise) — silenced via `.no-auto-commit`; squash agent cleaned the 8 backlog branches
- ⏸ This audit + reconciliation — **awaits user approval before any force-push.**

User decides Monday whether to:
- (i) approve the force-push reconciliation per the 10-commit plan above
- (ii) keep local master as personal trunk and never push (work-locally model)
- (iii) some hybrid (e.g., reconcile only specific features, not all 4647 lines)
