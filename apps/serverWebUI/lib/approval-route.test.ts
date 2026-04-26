// Integration test for the approval route handler factory.
// Verifies: round-trip approve, replay rejection, expired rejection, bad-sig rejection.

import { strict as assert } from 'node:assert';
import { signApprovalToken } from './approval-token';
import { InMemoryApprovalDb } from './approval-db';
import { makeApprovalRoute } from '../app/api/approve/[token]/route';

const SECRET = 'route-test-secret';

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];
const test = (n: string, fn: (typeof tests)[number]['fn']) => tests.push({ name: n, fn });

function makeReq() {
  return new Request('http://localhost/api/approve/x');
}

test('approves a valid token and flips state', async () => {
  const db = new InMemoryApprovalDb();
  const route = makeApprovalRoute({ db, secret: SECRET });
  const { token } = signApprovalToken({ job_id: 'job-1', action: 'approve' }, SECRET);
  const res = await route(makeReq(), { params: Promise.resolve({ token }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.action, 'approve');
  assert.equal(db._getState('job-1'), 'approved');
});

test('rejects replay (same jti used twice)', async () => {
  const db = new InMemoryApprovalDb();
  const route = makeApprovalRoute({ db, secret: SECRET });
  const { token } = signApprovalToken({ job_id: 'job-2', action: 'reject' }, SECRET);
  const r1 = await route(makeReq(), { params: Promise.resolve({ token }) });
  assert.equal(r1.status, 200);
  const r2 = await route(makeReq(), { params: Promise.resolve({ token }) });
  assert.equal(r2.status, 409);
  const body = await r2.json();
  assert.equal(body.error, 'already_used');
});

test('rejects expired token', async () => {
  const db = new InMemoryApprovalDb();
  const route = makeApprovalRoute({ db, secret: SECRET });
  const { token } = signApprovalToken(
    { job_id: 'job-3', action: 'approve', ttlSeconds: -10 },
    SECRET,
  );
  const res = await route(makeReq(), { params: Promise.resolve({ token }) });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'expired');
});

test('rejects bad signature', async () => {
  const db = new InMemoryApprovalDb();
  const route = makeApprovalRoute({ db, secret: SECRET });
  const { token } = signApprovalToken({ job_id: 'job-4', action: 'reject' }, SECRET);
  const tampered = token.slice(0, -2) + 'AA';
  const res = await route(makeReq(), { params: Promise.resolve({ token: tampered }) });
  assert.equal(res.status, 400);
});

test('rejects malformed token', async () => {
  const db = new InMemoryApprovalDb();
  const route = makeApprovalRoute({ db, secret: SECRET });
  const res = await route(makeReq(), { params: Promise.resolve({ token: 'garbage' }) });
  assert.equal(res.status, 400);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok - ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL - ${t.name}`);
      console.error(e);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log(`\n${tests.length} passed`);
})();
