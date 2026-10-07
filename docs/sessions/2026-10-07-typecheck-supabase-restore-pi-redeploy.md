# 2026-10-07: Typecheck baseline, Supabase restore, Pi redeploy

Outcome: master pushed (000432f), typecheck green, cloud Supabase restored with hiring.cafe row, Pi redeployed and probe healthy. Authenticated UI QA and live-scan verification still open.

## Original Issue
- Push master and complete the three next steps: authenticated UI specs, hiring.cafe sites row plus Pi redeploy, fix typecheck baselines and restore the full pre-push typecheck.

## Follow-up Issues
- Pi unreachable over Tailscale (node key expired); reached over LAN instead.
- Cloud Supabase project paused (INACTIVE), blocking the sites insert and authenticated QA.
- Pi DNS broken (Tailscale-owned immutable resolv.conf).

## Completed Tasks
- [x] Pushed master to origin through the pre-push hook (c2fa7e1..9bdc0ad, later 24181bb and 000432f).
- [x] Typecheck: subagent made `pnpm typecheck` exit 0 on 11 projects (nx dependsOn ^build, contentlayer step for blog, local LocationBucket in core types with compile-time guard, AiFilterProfile as type alias, DbSchema rows added). Reviewed, merged (be5f66f), pushed. Pre-push runs typecheck and qa:unit again.
- [x] Synced merged parser and core code to the Pi (`/opt/first2apply-mono`) over `raspberrypi.local`, host key matched the trusted one.
- [x] Recovered a self-inflicted edge crash loop (deployed core from before the Deno import fix); edge healthy after re-sync.
- [x] Confirmed cloud Supabase went INACTIVE to ACTIVE_HEALTHY after restore; inserted `sites` row id 18 (Hiring Cafe, hiringCafe) with the same upstream logo URL as every other site.
- [x] Reran `deploy-local-ai.sh` on the Pi, restarted `f2a-server-probe` (now healthy).
- [x] Logged findings in BACKLOG.md and pushed.

## Skills Used
- `/summary` (this document)

## Key Findings
- Pi edge needed the typecheck-era core fix, because Deno cannot follow the extensionless `./classifyLocation` import.
- Cloud project had been paused, which stopped the probe; newest `jobs` row is 2026-08-15.
- Your own Supabase project has no storage buckets; all site logos point at upstream's bucket.
- Pi Tailscale is still logged out; Pi DNS recovered without it.

## Current State
- Authenticated UI specs not run (no QA credentials).
- Scanning not yet verified as landing jobs; parsers untested on live traffic.
- Pi Tailscale still needs browser login.

## Next Steps
- [→ P2] Provide F2A_QA_EMAIL / F2A_QA_PASSWORD and run `qa/run-qa.sh ui` against a build with a real `.env`.
- [→ P2] After one scan cycle, query `jobs` by `created_at` to confirm jobs land and parsers work live.
- [→ P1] Re-authenticate the Pi's Tailscale.
- [→ P3] Add a hiring.cafe link in the app to exercise the new parser.

## Session Stats
- Turns: about 7. Tokens: roughly 400k estimated plus about 76k in a Sonnet subagent. Cost: roughly $3 to $6 estimated, Sonnet pricing.
