import { strict as assert } from 'node:assert';
import { extractKeywords, mockExtract } from './index';

const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
const test = (n: string, fn: (typeof tests)[number]['fn']) => tests.push({ name: n, fn });

const MISSION = `We are building the most reliable distributed billing engine. We value
transparency, ownership, and craft. Our team works in TypeScript and Go on AWS with Kubernetes.`;

const JD = `We are looking for a Senior Backend Engineer to join Acme Cloud.
You will own the billing pipeline.
Required: 5+ years of TypeScript or Go.
Tools: Postgres, Kafka, Kubernetes, AWS.
Must have experience with distributed systems.
Bonus: GraphQL, gRPC.`;

test('mockExtract: mission picks up tools + values', () => {
  const r = mockExtract(MISSION);
  assert.ok(r.tools.includes('typescript'));
  assert.ok(r.tools.includes('aws'));
  assert.ok(r.tools.includes('kubernetes'));
  assert.ok(r.values.includes('transparency'));
  assert.ok(r.values.includes('ownership'));
});

test('mockExtract: jd picks required phrases', () => {
  const r = mockExtract(JD);
  assert.ok(r.required.length >= 2, `expected required entries, got ${r.required.length}`);
  assert.ok(r.required.some((s) => s.includes('required')) || r.required.some((s) => s.includes('must have')));
});

test('mockExtract: skills are non-empty for jd', () => {
  const r = mockExtract(JD);
  assert.ok(r.skills.length > 0);
  // tools should not also appear in skills
  for (const t of r.tools) assert.ok(!r.skills.includes(t));
});

test('extractKeywords falls back to mock under F2A_AI_MOCK=1', async () => {
  process.env.F2A_AI_MOCK = '1';
  try {
    const r = await extractKeywords(JD, 'jd');
    assert.ok(r.tools.length > 0);
  } finally {
    delete process.env.F2A_AI_MOCK;
  }
});

test('extractKeywords routes through ai client when supplied', async () => {
  let called = 0;
  const ai = {
    chatJson: async () => {
      called++;
      return {
        json: { skills: ['s1'], tools: ['T1'], values: [] as string[], required: [] as string[] },
        tokens_in: 100,
        tokens_out: 50,
      };
    },
  };
  // Use a sandboxed ledger path so we don't pollute repo
  process.env.F2A_AI_MOCK = '0';
  try {
    const r = await extractKeywords('hello world', 'mission', { ai, forceMock: false });
    assert.equal(called, 1);
    assert.deepEqual(r.tools, ['t1']);
    assert.deepEqual(r.skills, ['s1']);
  } finally {
    delete process.env.F2A_AI_MOCK;
  }
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
