import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { buildResilientFetch } from './localFetch.ts';

const ok = () => new Response('{}', { status: 200 });
const noSleep = () => Promise.resolve();

Deno.test('retries network errors until the server answers', async () => {
  let calls = 0;
  const f = buildResilientFetch({
    fetchImpl: () => {
      calls++;
      return calls < 3 ? Promise.reject(new TypeError('connection refused')) : Promise.resolve(ok());
    },
    sleep: noSleep,
  });
  const res = await f('http://127.0.0.1:11434/v1/chat/completions');
  assertEquals(res.status, 200);
  assertEquals(calls, 3);
});

Deno.test('does not retry HTTP error statuses', async () => {
  let calls = 0;
  const f = buildResilientFetch({
    fetchImpl: () => {
      calls++;
      return Promise.resolve(new Response('bad', { status: 500 }));
    },
    sleep: noSleep,
  });
  const res = await f('http://x');
  assertEquals(res.status, 500);
  assertEquals(calls, 1);
});

Deno.test('gives up after maxWaitMs and rethrows the last error', async () => {
  let calls = 0;
  const f = buildResilientFetch({
    maxWaitMs: 9_000,
    intervalMs: 3_000,
    fetchImpl: () => {
      calls++;
      return Promise.reject(new TypeError('still down'));
    },
    sleep: noSleep,
  });
  await assertRejects(() => f('http://x'), TypeError, 'still down');
  assertEquals(calls, 4); // initial try plus 3 retries within 9s
});

Deno.test('never retries an aborted request', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const f = buildResilientFetch({
    fetchImpl: () => {
      calls++;
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    },
    sleep: noSleep,
  });
  await assertRejects(() => f('http://x', { signal: controller.signal }));
  assertEquals(calls, 1);
});

Deno.test('reports each retry', async () => {
  const seen: number[] = [];
  let calls = 0;
  const f = buildResilientFetch({
    fetchImpl: () => (++calls < 3 ? Promise.reject(new Error('down')) : Promise.resolve(ok())),
    sleep: noSleep,
    onRetry: ({ attempt }) => seen.push(attempt),
  });
  await f('http://x');
  assert(seen.length === 2 && seen[0] === 1 && seen[1] === 2);
});
