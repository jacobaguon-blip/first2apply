# Pi changelog

Operational history for the Raspberry Pi (`raspberrypi`, Tailscale MagicDNS). The repo copy is
`deploy/pi/CHANGELOG.md`. The deployed copy lives at `/opt/first2apply/CHANGELOG.md`, so read it on the
Pi before touching anything. Newest entry first. Add an entry for every durable change to the Pi.

## 2026-10-29: AI inference moved from Ollama to a Codex shim (ChatGPT plan)

**Why.** Ollama running `qwen2.5:3b-f2a` on the Pi 5 CPU kept the load average at 12 to 22, wedged
scans (probe `healthz` stale or unhealthy), and starved the other services (`pi-scanner-1`,
Home Assistant). The owner has a ChatGPT plan with Codex access, so inference moved off the Pi.

**What changed.**
- New systemd unit `f2a-codex-shim` (`/etc/systemd/system/f2a-codex-shim.service`, source
  `deploy/pi/systemd/f2a-codex-shim.service`). Runs `/opt/first2apply/codex-shim/server.mjs`
  (source `deploy/pi/codex-shim/server.mjs`) as user `first2apply` on `127.0.0.1:11435`.
- The shim is an OpenAI-compatible `POST /v1/chat/completions` server. Each request runs
  `codex exec --ephemeral --ignore-user-config --ignore-rules -s read-only` with model `gpt-6-luna` at
  `low` reasoning effort. `response_format` maps to `--output-schema` (the shim normalizes zod schemas
  to OpenAI strict form). Returns zero token usage, so `log_ai_usage` records a cost of 0.
- Codex CLI installed globally (`sudo npm i -g @openai/codex`, version 0.165.0). Logged in with
  ChatGPT as the `first2apply` user. Credentials: `/opt/first2apply/codex-home/auth.json` (mode 600,
  treat as a secret, never copy it off the Pi).
- Edge `.env` (`/opt/first2apply-mono/apps/backend/supabase/functions/.env`): `F2A_AI_PROVIDER=local`,
  `F2A_OLLAMA_URL=http://127.0.0.1:11435/v1`, `F2A_OLLAMA_MODEL=gpt-6-luna`. These are the legacy names.
  The code now prefers `F2A_LLM_URL` and `F2A_LLM_MODEL` and falls back to the old ones. Rename them in
  the `.env` whenever the edge container is next recreated. Backup of the prior file: `.env.pre-codex-shim`.
- `f2a-edge-local` was recreated with `docker compose ... up -d --no-deps --force-recreate edge`.
- Ollama stopped: container `ollama` stopped with `--restart=no`, `ollama-on-demand.timer` disabled.
  Left in place on purpose: Docker volume `ollama` (the model files, several GB) and
  `/opt/first2apply/ollama-on-demand.sh` (+ `.pre-load-grace`). Delete them once this change has proven itself.

**Measured.**
- Load average fell from about 22 to 5 within a minute of stopping Ollama. `f2a-server-probe` went
  from `unhealthy` to `healthy`.
- A shim call takes 3 to 10 seconds (32 seconds once, while the Pi was still saturated). Ollama took
  minutes per chunk.
- Cost is about 6.6k Codex tokens for a trivial prompt and 16k to 25k for a real 16k character chunk. The
  shim logs `tokens=` per call (`journalctl -u f2a-codex-shim`). Watch plan usage.
- Verified end to end with a real scan of link 31 (Fjallraven custom board): parsed and landed 3 new jobs.
- Model check on a real board chunk: `gpt-6-luna` low matched `gpt-6.1-sol` medium exactly (5 of 5 jobs).

**Known risks.**
- OpenAI terms for unattended use of a ChatGPT login are unconfirmed. Review
  https://developers.openai.com/codex/auth before relying on this long term.
- The plan has a rolling usage window. A burst of custom-board scans could exhaust it, and calls would
  then fail (shim returns HTTP 500 with the Codex error). Fallback is `F2A_AI_PROVIDER=openai` with a funded
  `OPENAI_API_KEY` in the edge `.env`.
- Codex CLI upgrades can change flags or output. The shim depends on `exec --ephemeral`, `--ignore-user-config`,
  `--ignore-rules`, `--output-schema` and `-o`. Pin the version if it breaks.
- The login can expire. Symptom: shim 500s mentioning auth. Fix: re-run the login below.

**Operate.**
- Health: `curl -s localhost:11435/health` (also `systemctl status f2a-codex-shim`).
- Logs: `journalctl -u f2a-codex-shim -f`. Edge side: `docker logs f2a-edge-local` (look for
  `Using local model gpt-6-luna`).
- Re-login: `sudo -u first2apply env CODEX_HOME=/opt/first2apply/codex-home TERM=xterm-256color codex login --device-auth`
  (needs a browser, choose "Sign in with ChatGPT"). Check with `codex login status` under the same env.
- Redeploy the shim: copy `deploy/pi/codex-shim/server.mjs` to `/opt/first2apply/codex-shim/`, then
  `sudo systemctl restart f2a-codex-shim`.
- Tunables (unit `Environment=`): `SHIM_MODEL`, `SHIM_EFFORT`, `SHIM_CONCURRENCY` (2), `SHIM_TIMEOUT_MS`.
- Run the shim tests anywhere with Node: `node --test deploy/pi/codex-shim/server.test.mjs`.

**Rollback to Ollama.**
1. `cp -p <edge .env>.pre-codex-shim <edge .env>` (restores the Ollama URL and model).
2. `docker start ollama && docker update --restart=unless-stopped ollama`.
3. `sudo systemctl enable --now ollama-on-demand.timer`.
4. Recreate edge: `docker compose -f /opt/first2apply-mono/deploy/compose.local-ai.yaml up -d --no-deps --force-recreate edge`.
   This needs the pre-change compose file (the Ollama service was removed from the repo copy), so check out
   the commit before `feat/codex-shim` for `deploy/pi/`. Ollama also needs its idle script back.

**Gotchas hit while deploying (save yourself the time).**
- `deploy-local-ai.sh` runs `docker compose pull`, which hangs for many minutes on a loaded Pi. With
  Ollama gone it only pulls the deno image, but to apply an `.env` change just recreate `edge` directly.
- An `.env` change needs a container recreate. `docker restart` does not re-read `env_file`.
- `pkill -f "<pattern>"` over SSH kills your own session when the pattern appears in the SSH command line
  (exit 255). Use a bracket pattern such as `pkill -f "[d]eploy-local-ai"`.
- Ghostty sends `TERM=xterm-ghostty`, which the Pi lacks. Prefix `TERM=xterm-256color` for nano or login prompts.

## Earlier history

Before this file existed, Pi changes were recorded in `CLAUDE.md` (Pi ops gotchas, 2026-10-07 and
2026-10-09), `troubleshooting/` and `docs/superpowers/specs/2026-05-27-local-ai-on-pi-design.md`.
