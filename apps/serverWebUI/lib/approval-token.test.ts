import { strict as assert } from 'node:assert';
import { ApprovalTokenError, signApprovalToken, verifyApprovalToken } from './approval-token';

const SECRET = 'test-secret';
const tests: Array<{ name: string; fn: () => void }> = [];
const test = (n: string, fn: () => void) => tests.push({ name: n, fn });

test('round-trip approve', () => {
  const { token, payload } = signApprovalToken({ job_id: 'j1', action: 'approve' }, SECRET);
  const got = verifyApprovalToken(token, SECRET);
  assert.equal(got.job_id, 'j1');
  assert.equal(got.action, 'approve');
  assert.equal(got.jti, payload.jti);
});

test('rejects bad signature', () => {
  const { token } = signApprovalToken({ job_id: 'j1', action: 'reject' }, SECRET);
  const tampered = token.slice(0, -2) + 'AA';
  assert.throws(() => verifyApprovalToken(tampered, SECRET), (e: Error) => e instanceof ApprovalTokenError && (e as ApprovalTokenError).code === 'bad_sig');
});

test('rejects wrong secret', () => {
  const { token } = signApprovalToken({ job_id: 'j1', action: 'reject' }, SECRET);
  assert.throws(() => verifyApprovalToken(token, 'other'), (e: Error) => e instanceof ApprovalTokenError && (e as ApprovalTokenError).code === 'bad_sig');
});

test('rejects expired', () => {
  const { token } = signApprovalToken({ job_id: 'j1', action: 'approve', ttlSeconds: -10 }, SECRET);
  assert.throws(() => verifyApprovalToken(token, SECRET), (e: Error) => e instanceof ApprovalTokenError && (e as ApprovalTokenError).code === 'expired');
});

test('rejects malformed', () => {
  assert.throws(() => verifyApprovalToken('not.a.real.token', SECRET));
  assert.throws(() => verifyApprovalToken('only-one-part', SECRET));
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
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
