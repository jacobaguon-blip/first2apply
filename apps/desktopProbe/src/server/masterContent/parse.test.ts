import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MasterContentValidationError,
  parseMasterCoverLetter,
  parseMasterResume,
} from './parse';

const tests: Array<{ name: string; fn: () => void }> = [];
const test = (name: string, fn: () => void) => tests.push({ name, fn });

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '..', '..', 'tests', 'fixtures', 'master-content');

test('parses fixture resume JSON', () => {
  const raw = readFileSync(join(FIXTURE_DIR, 'master-resume.fixture.json'), 'utf8');
  const r = parseMasterResume(raw);
  assert.equal(r.version, 1);
  assert.ok(r.skills?.includes('TypeScript'));
});

test('parses fixture cover letter JSON', () => {
  const raw = readFileSync(join(FIXTURE_DIR, 'master-cover-letter.fixture.json'), 'utf8');
  const r = parseMasterCoverLetter(raw);
  assert.equal(r.version, 1);
  assert.ok((r.body_paragraphs?.length ?? 0) >= 1);
});

test('rejects non-object resume', () => {
  assert.throws(() => parseMasterResume(42 as unknown), MasterContentValidationError);
});

test('rejects wrong version', () => {
  assert.throws(() => parseMasterResume({ version: 2 }), MasterContentValidationError);
});

test('skeleton resume from raw text', () => {
  const r = parseMasterResume('this is not json');
  assert.equal(r.version, 1);
  assert.equal(r.summary, 'this is not json');
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
