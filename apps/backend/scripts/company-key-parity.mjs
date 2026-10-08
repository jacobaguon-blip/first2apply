// Checks public.company_key (SQL) against the shared fixtures.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/backend/scripts/company-key-parity.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const fixturesPath = fileURLToPath(
  new URL('../../../libraries/core/src/__fixtures__/companyKey.fixtures.json', import.meta.url),
);
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));

let failures = 0;
for (const { input, key: expected } of fixtures) {
  const res = await fetch(`${url}/rest/v1/rpc/company_key`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input }),
  });
  if (!res.ok) throw new Error(`rpc failed (${res.status}): ${await res.text()}`);
  const actual = await res.json();
  if (actual !== expected) {
    failures++;
    console.error(
      `MISMATCH ${JSON.stringify(input)}: sql=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
    );
  }
}
console.log(failures === 0 ? `OK: ${fixtures.length} fixtures match` : `FAILED: ${failures} mismatches`);
process.exit(failures === 0 ? 0 : 1);
