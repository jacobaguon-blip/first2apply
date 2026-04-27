import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockExtract } from '../keywords/index';
import { parseMasterCoverLetter, parseMasterResume } from '../masterContent/parse';
import { buildTailoredCoverLetter, buildTailoredResume } from './builder';

const FIX = join(__dirname, '..', '..', '..', '..', '..', 'tests', 'fixtures', 'master-content');

const tests: Array<{ name: string; fn: () => void }> = [];
const test = (n: string, fn: () => void) => tests.push({ name: n, fn });

test('builds tailored resume emphasizing JD-matched skills', () => {
  const master = parseMasterResume(readFileSync(join(FIX, 'master-resume.fixture.json'), 'utf8'));
  const jdK = mockExtract(
    `Senior backend role. Required: TypeScript, Postgres, Kafka, Kubernetes. Distributed systems.`,
  );
  const missionK = mockExtract('We value transparency, ownership, and craft.');
  const r = buildTailoredResume({ master, jdKeywords: jdK, missionKeywords: missionK });
  // master skills include TypeScript, Kubernetes, Kafka, Postgres etc.
  assert.ok(r.emphasized_tools.length >= 1, `expected emphasized tools, got ${JSON.stringify(r.emphasized_tools)}`);
  assert.ok(r.rationale.includes('Tailored'));
});

test('builds tailored cover letter with placeholders filled', () => {
  const master = parseMasterCoverLetter(
    readFileSync(join(FIX, 'master-cover-letter.fixture.json'), 'utf8'),
  );
  const jdK = mockExtract('Senior Engineer. TypeScript. Postgres. Distributed systems.');
  const missionK = mockExtract('We value ownership and craft and transparency.');
  const r = buildTailoredCoverLetter({
    master,
    company: 'Acme Cloud',
    role: 'Senior Engineer',
    jdKeywords: jdK,
    missionKeywords: missionK,
  });
  assert.ok(r.body_paragraphs.length >= 1);
  // first paragraph in fixture has {{role}} and {{company}}
  assert.ok(r.body_paragraphs[0].includes('Acme Cloud'));
  assert.ok(r.body_paragraphs[0].includes('Senior Engineer'));
  assert.equal(r.placeholders_filled.company, 'Acme Cloud');
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
