import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectionsCsv, parseLinkedInDate } from './csv';
import { enrichConnections, makeFixtureSource, type CompanyEnrichment } from './enrich';

const FIX = join(__dirname, '..', '..', '..', '..', '..', 'tests', 'fixtures');

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
const test = (name: string, fn: (typeof tests)[number]['fn']) => tests.push({ name, fn });

test('parses fixture CSV (50 rows)', () => {
  const csv = readFileSync(join(FIX, 'connections.sample.csv'), 'utf8');
  const { connections, warnings } = parseConnectionsCsv(csv);
  assert.equal(connections.length, 50);
  assert.equal(warnings.length, 0);
  assert.equal(connections[0].firstName, 'Avery');
  assert.equal(connections[0].connectedOnIso, '2024-02-01');
});

test('parses LinkedIn date format', () => {
  assert.equal(parseLinkedInDate('11 Jun 2024'), '2024-06-11');
  assert.equal(parseLinkedInDate('1 Jan 2025'), '2025-01-01');
  assert.equal(parseLinkedInDate('garbage'), null);
});

test('rejects CSV without header', () => {
  assert.throws(() => parseConnectionsCsv('foo,bar\n1,2\n'));
});

test('handles quoted commas', () => {
  const csv =
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On\n' +
    '"Smith, Jr.",Doe,https://x,e@x,"Acme, Inc.","Sr. Engineer","11 Jun 2024"\n';
  const { connections } = parseConnectionsCsv(csv);
  assert.equal(connections.length, 1);
  assert.equal(connections[0].firstName, 'Smith, Jr.');
  assert.equal(connections[0].company, 'Acme, Inc.');
});

test('enrichment uses fixture source + caches by company', async () => {
  const csv = readFileSync(join(FIX, 'connections.sample.csv'), 'utf8');
  const enrichmentTable = JSON.parse(
    readFileSync(join(FIX, 'connections.enrichment.json'), 'utf8'),
  ) as Record<string, CompanyEnrichment>;
  const { connections } = parseConnectionsCsv(csv);

  let calls = 0;
  const wrapped = makeFixtureSource(enrichmentTable);
  const counted = async (company: string) => {
    calls++;
    return wrapped(company);
  };
  const enriched = await enrichConnections(connections, counted);
  assert.equal(enriched.length, 50);
  // 14 distinct companies in the fixture
  assert.equal(calls, 14);
  const acme = enriched.find((e) => e.company === 'Acme Cloud');
  assert.ok(acme?.company_linkedin_url?.includes('acme'));
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
