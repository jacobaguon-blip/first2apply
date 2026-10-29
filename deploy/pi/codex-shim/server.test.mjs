import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { buildPrompt, buildServer, normalizeSchema, stripFences } from './server.mjs';

let server, base, dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shim-test-'));
  // stub codex: records argv and stdin, writes STUB_REPLY to the -o file
  const stub = join(dir, 'codex');
  await writeFile(
    stub,
    `#!/bin/bash
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
echo "$@" > "${dir}/argv.txt"; cat > "${dir}/stdin.txt"
if [ -n "$STUB_FAIL" ]; then echo boom >&2; exit 3; fi
printf '%s' "\${STUB_REPLY:-hello}" > "$out"
`,
  );
  await chmod(stub, 0o755);
  process.env.SHIM_CODEX_BIN = stub;
  server = buildServer({ port: 0, host: '127.0.0.1', model: 'gpt-6-luna', effort: 'low', concurrency: 1, timeoutMs: 10_000, token: 'sekret', codexBin: stub });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body, token = 'sekret') =>
  fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('normalizeSchema closes objects and requires every property', () => {
  const out = normalizeSchema({ type: 'object', properties: { a: { type: ['string', 'null'] }, b: { type: 'object', properties: { c: { type: 'string' } } } } });
  assert.deepEqual(out.required, ['a', 'b']);
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.properties.b.required, ['c']);
});

test('normalizeSchema unwraps zod optional-nullable and drops unsupported keywords', () => {
  const out = normalizeSchema({ type: 'object', properties: { logo: { anyOf: [{ anyOf: [{ not: {} }, { type: 'string', maxLength: 5 }] }, { type: 'null' }] } } });
  assert.deepEqual(out.properties.logo, { anyOf: [{ type: 'string' }, { type: 'null' }] });
});

test('stripFences and buildPrompt', () => {
  assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
  assert.match(buildPrompt([{ role: 'system', content: 'S' }, { role: 'user', content: [{ type: 'text', text: 'U' }] }], { type: 'json_object' }), /\[system\]\nS\n\n\[user\]\nU[\s\S]*ONLY a single valid JSON/);
});

test('health needs no token, API rejects a bad token', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await post({ messages: [{ role: 'user', content: 'x' }] }, 'wrong')).status, 401);
});

test('plain chat returns an OpenAI-shaped completion and maps the model', async () => {
  const res = await post({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.choices[0].message.content, 'hello');
  assert.equal(json.choices[0].finish_reason, 'stop');
  assert.equal(json.model, 'gpt-6-luna');
  const argv = await readFile(join(dir, 'argv.txt'), 'utf8');
  assert.match(argv, /--ignore-user-config/);
  assert.match(argv, /-m gpt-6-luna/);
  assert.match(await readFile(join(dir, 'stdin.txt'), 'utf8'), /\[user\]\nhi/);
});

test('json_schema passes --output-schema and strips fences', async () => {
  process.env.STUB_REPLY = '```json\n{"jobs":[]}\n```';
  const res = await post({ messages: [{ role: 'user', content: 'x' }], response_format: { type: 'json_schema', json_schema: { name: 'T', schema: { type: 'object', properties: { jobs: { type: 'array', items: { type: 'string' } } } } } } });
  const json = await res.json();
  delete process.env.STUB_REPLY;
  assert.equal(json.choices[0].message.content, '{"jobs":[]}');
  assert.match(await readFile(join(dir, 'argv.txt'), 'utf8'), /--output-schema/);
});

test('codex failure becomes a 500 with the cause', async () => {
  process.env.STUB_FAIL = '1';
  const res = await post({ messages: [{ role: 'user', content: 'x' }] });
  delete process.env.STUB_FAIL;
  assert.equal(res.status, 500);
  assert.match((await res.json()).error.message, /codex exited 3/);
});

test('missing messages is a 400', async () => {
  assert.equal((await post({})).status, 400);
});
