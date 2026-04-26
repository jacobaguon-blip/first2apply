import { strict as assert } from 'node:assert';
import {
  AiBudgetExceededError,
  assertWithinBudget,
  estimateCostUsd,
  HARD_CAP_USD,
  readLedger,
  recordSpend,
} from './budget';

const tests: Array<{ name: string; fn: () => void }> = [];
const test = (name: string, fn: () => void) => tests.push({ name, fn });

function memFs() {
  const store = new Map<string, string>();
  return {
    _store: store,
    read: (p: string) => {
      if (!store.has(p)) throw new Error('ENOENT ' + p);
      return store.get(p)!;
    },
    write: (p: string, s: string) => {
      store.set(p, s);
    },
    exists: (p: string) => store.has(p),
  };
}

test('estimateCostUsd: gpt-4o-mini per spec', () => {
  const c = estimateCostUsd(1_000_000, 1_000_000, 'gpt-4o-mini');
  assert.equal(c, 0.15 + 0.6);
});

test('assertWithinBudget passes for tiny ask on empty ledger', () => {
  const fs = memFs();
  // Empty ledger; tiny ask should pass.
  assertWithinBudget(1000, 'gpt-4o-mini', { fs, ledgerPath: '/tmp/ledger.json' });
});

test('assertWithinBudget throws when projected exceeds cap', () => {
  const fs = memFs();
  // Pre-populate ledger near the cap.
  fs.write(
    '/tmp/ledger.json',
    JSON.stringify({ total_usd: HARD_CAP_USD - 0.0001, entries: [] }),
  );
  assert.throws(
    () => assertWithinBudget(1_000_000, 'gpt-4o-mini', { fs, ledgerPath: '/tmp/ledger.json' }),
    AiBudgetExceededError,
  );
});

test('recordSpend appends entries and persists total', () => {
  const fs = memFs();
  const ledger1 = recordSpend(1000, 500, 'gpt-4o-mini', {
    fs,
    ledgerPath: '/tmp/ledger.json',
    note: 'test1',
  });
  assert.equal(ledger1.entries.length, 1);
  const ledger2 = recordSpend(2000, 1000, 'gpt-4o-mini', { fs, ledgerPath: '/tmp/ledger.json' });
  assert.equal(ledger2.entries.length, 2);
  // total_usd should be sum of both
  const expected = estimateCostUsd(1000, 500, 'gpt-4o-mini') + estimateCostUsd(2000, 1000, 'gpt-4o-mini');
  assert.ok(Math.abs(ledger2.total_usd - expected) < 1e-6);
});

test('readLedger returns empty when no file', () => {
  const fs = memFs();
  const l = readLedger({ fs, ledgerPath: '/tmp/missing.json' });
  assert.equal(l.total_usd, 0);
  assert.equal(l.entries.length, 0);
});

test('F2A_AI_MOCK=1 bypasses budget assert and zeros recorded cost', () => {
  const fs = memFs();
  process.env.F2A_AI_MOCK = '1';
  try {
    fs.write(
      '/tmp/ledger.json',
      JSON.stringify({ total_usd: HARD_CAP_USD - 0.0001, entries: [] }),
    );
    // Even a giant ask passes when mock is on.
    assertWithinBudget(1_000_000, 'gpt-4o-mini', { fs, ledgerPath: '/tmp/ledger.json' });
    const l = recordSpend(1000, 500, 'gpt-4o-mini', { fs, ledgerPath: '/tmp/ledger.json' });
    // total_usd should not have grown beyond the seeded value.
    assert.ok(l.total_usd <= HARD_CAP_USD);
    assert.equal(l.entries[l.entries.length - 1].cost_usd, 0);
  } finally {
    delete process.env.F2A_AI_MOCK;
  }
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
