// apps/serverProbe — headless probe entrypoint (Electron-main shape, but runs as plain Node
// during scaffold). The real Electron wrapper is added Monday once Xvfb + electron-builder
// configuration is finalized; for now `node dist/main.js --probe-once` performs a single
// scrape cycle using the same scrapers as desktopProbe — using fixture I/O when
// F2A_MOCK_SCRAPE=1 (which is what scripts/weekend-dry-run.sh sets).
//
// Spec: spec.md §5 Item 4 + §9.1.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type Args = { probeOnce: boolean; headless: boolean };

function parseArgs(argv: string[]): Args {
  return {
    probeOnce: argv.includes('--probe-once'),
    headless: argv.includes('--headless'),
  };
}

async function probeOnce(): Promise<number> {
  const mock = process.env.F2A_MOCK_SCRAPE === '1';
  console.log(`[serverProbe] probe-once start (mock=${mock})`);
  if (mock) {
    const fixtureDir = join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'scrape');
    if (!existsSync(fixtureDir)) {
      console.log(`[serverProbe] fixture dir missing at ${fixtureDir} — emitting empty result`);
      return 0;
    }
    const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.json'));
    let total = 0;
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(fixtureDir, f), 'utf8'));
        const n = Array.isArray(data?.jobs) ? data.jobs.length : 0;
        total += n;
        console.log(`[serverProbe]   ${f}: ${n} jobs`);
      } catch (e) {
        console.warn(`[serverProbe]   ${f}: parse error — ${(e as Error).message}`);
      }
    }
    console.log(`[serverProbe] probe-once OK (mock total=${total})`);
    return 0;
  }
  console.log('[serverProbe] live scrape disabled in scaffold — set F2A_MOCK_SCRAPE=1 to use fixtures');
  return 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.probeOnce) {
    process.exit(await probeOnce());
  }
  console.log('[serverProbe] long-running mode not yet implemented (scaffold). Use --probe-once.');
  process.exit(0);
}

void main();
