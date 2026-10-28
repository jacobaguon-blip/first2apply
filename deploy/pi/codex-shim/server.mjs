#!/usr/bin/env node
/**
 * OpenAI-compatible shim in front of `codex exec`.
 *
 * The edge functions talk to any OpenAI-compatible server through the `local` provider branch in
 * `_shared/openAI.ts` (baseURL = F2A_OLLAMA_URL). This server accepts POST /v1/chat/completions and
 * answers it by running `codex exec` signed in with a ChatGPT plan, so inference needs no API key
 * and no local model.
 *
 * Env: SHIM_PORT (11435), SHIM_HOST (127.0.0.1), SHIM_MODEL (gpt-6-luna), SHIM_EFFORT (low),
 * SHIM_CONCURRENCY (2), SHIM_TIMEOUT_MS (240000), SHIM_TOKEN (optional bearer), SHIM_CODEX_BIN (codex).
 * Auth comes from CODEX_HOME/auth.json (run `codex login --device-auth` once as the service user).
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cfg = () => ({
  port: Number(process.env.SHIM_PORT ?? 11435),
  host: process.env.SHIM_HOST ?? '127.0.0.1',
  model: process.env.SHIM_MODEL ?? 'gpt-6-luna',
  effort: process.env.SHIM_EFFORT ?? 'low',
  concurrency: Number(process.env.SHIM_CONCURRENCY ?? 2),
  timeoutMs: Number(process.env.SHIM_TIMEOUT_MS ?? 240_000),
  token: process.env.SHIM_TOKEN ?? '',
  codexBin: process.env.SHIM_CODEX_BIN ?? 'codex',
});

const UNSUPPORTED_KEYWORDS = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'pattern', 'format', 'default'];
const isNever = (n) => n && typeof n === 'object' && Object.keys(n).length === 1 && n.not && Object.keys(n.not).length === 0;

/**
 * codex --output-schema is OpenAI strict mode: objects closed, every property required (optional means
 * nullable), no `not`, no size/pattern keywords. zod's `.optional().nullable()` emits `anyOf:[{not:{}},...]`,
 * so drop those branches and unwrap single-branch anyOf. The edge function re-validates with zod anyway.
 */
export function normalizeSchema(node) {
  if (Array.isArray(node)) return node.map(normalizeSchema);
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => !UNSUPPORTED_KEYWORDS.includes(k))
      .map(([k, v]) => [k, normalizeSchema(v)]),
  );
  if (Array.isArray(out.anyOf)) {
    out.anyOf = out.anyOf.filter((branch) => !isNever(branch));
    if (out.anyOf.length === 1) {
      const { anyOf, ...rest } = out;
      return { ...anyOf[0], ...rest };
    }
  }
  if (out.type === 'object' && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

const contentToText = (content) =>
  Array.isArray(content) ? content.map((part) => part?.text ?? '').join('\n') : String(content ?? '');

export function buildPrompt(messages, responseFormat) {
  const parts = messages.map((m) => `[${m.role}]\n${contentToText(m.content)}`);
  if (responseFormat?.type === 'json_object') {
    parts.push('[instructions]\nReply with ONLY a single valid JSON object. No prose, no code fences.');
  } else if (responseFormat?.type === 'json_schema') {
    parts.push('[instructions]\nReply with ONLY the JSON object that matches the required output schema.');
  }
  return parts.join('\n\n');
}

export function stripFences(text) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : text.trim();
}

async function runCodex({ prompt, schema, config }) {
  const dir = await mkdtemp(join(tmpdir(), 'f2a-codex-'));
  return new Promise(async (resolve, reject) => {
    const outFile = join(dir, 'out.txt');
    const args = [
      'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules',
      '-s', 'read-only', '-m', config.model, '-c', `model_reasoning_effort="${config.effort}"`,
      '-o', outFile,
    ];
    if (schema) {
      const schemaFile = join(dir, 'schema.json');
      await writeFile(schemaFile, JSON.stringify(normalizeSchema(schema)));
      args.push('--output-schema', schemaFile);
    }
    args.push('-');

    const child = spawn(config.codexBin, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), config.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      return rm(dir, { recursive: true, force: true });
    };
    child.on('error', async (error) => {
      await cleanup();
      reject(error);
    });
    child.on('close', async (code, signal) => {
      try {
        if (code !== 0) throw new Error(`codex exited ${code ?? signal}: ${log.slice(-500)}`);
        const text = (await readFile(outFile, 'utf8')).trim();
        if (!text) throw new Error('codex returned an empty reply');
        resolve({ text, tokens: log.replace(/\u001b\[[0-9;]*m/g, '').match(/tokens used\s*([\d,]+)/i)?.[1] ?? '?' });
      } catch (error) {
        reject(error);
      } finally {
        await cleanup();
      }
    });
    child.stdin.end(prompt);
  });
}

function makeLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || !waiting.length) return;
    active++;
    waiting.shift()();
  };
  return async (task) => {
    await new Promise((go) => (waiting.push(go), next()));
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}

const readJson = async (req) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
};

export function buildServer(config = cfg()) {
  const limit = makeLimiter(config.concurrency);
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: config.model });
      if (config.token && req.headers.authorization !== `Bearer ${config.token}`) {
        return send(res, 401, { error: { message: 'unauthorized' } });
      }
      if (req.method === 'GET' && req.url === '/v1/models') {
        return send(res, 200, { object: 'list', data: [{ id: config.model, object: 'model' }] });
      }
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        return send(res, 404, { error: { message: 'not found' } });
      }

      const body = await readJson(req);
      if (!Array.isArray(body.messages) || !body.messages.length) {
        return send(res, 400, { error: { message: 'messages is required' } });
      }
      const rf = body.response_format;
      const schema = rf?.type === 'json_schema' ? rf.json_schema?.schema : undefined;
      const prompt = buildPrompt(body.messages, rf);

      const started = Date.now();
      const { text, tokens } = await limit(() => runCodex({ prompt, schema, config }));
      const content = rf ? stripFences(text) : text;
      console.log(`ok model=${config.model} requested=${body.model} ${Date.now() - started}ms tokens=${tokens}`);

      send(res, 200, {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: config.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        // plan-billed, so no per-token cost to report (matches the local provider's zero cost).
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } catch (error) {
      console.error(`error: ${error?.message ?? error}`);
      send(res, 500, { error: { message: String(error?.message ?? error), type: 'codex_shim_error' } });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = cfg();
  buildServer(config).listen(config.port, config.host, () => {
    console.log(`codex shim on ${config.host}:${config.port} model=${config.model} effort=${config.effort}`);
  });
}
