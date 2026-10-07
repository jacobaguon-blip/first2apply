#!/usr/bin/env node
// Small helper for run-qa.sh. Keeps JSON and output parsing out of bash.
//
// Usage:
//   qa-util.js deno-parse <deno-output-file>              -> "<name>\t<ok|FAILED|ignored>" per test
//   qa-util.js vitest-parse <vitest-json-file>            -> "<name>\t<ok|FAILED>" per test
//   qa-util.js pw-parse <playwright-results-json-file>    -> "<name>\t<ok|FAILED|skipped>" per test
//   qa-util.js tc-count <deno-check-output-file>          -> number of type errors
//   qa-util.js baseline <key.path>                        -> value from known-failures.json
//   qa-util.js compare <suite> <results.tsv>              -> NEW|KNOWN|FIXED lines for the suite
const fs = require('fs');
const path = require('path');

const KNOWN = path.join(__dirname, '..', 'known-failures.json');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

function loadKnown() {
  return JSON.parse(fs.readFileSync(KNOWN, 'utf8'));
}

const [cmd, arg1, arg2] = process.argv.slice(2);

if (cmd === 'deno-parse') {
  const text = strip(fs.readFileSync(arg1, 'utf8'));
  for (const line of text.split('\n')) {
    // Deno test lines: "<name> ... ok (12ms)" or "<name> ... FAILED (12ms)".
    const m = line.match(/^(.+?) \.\.\. (ok|FAILED|ignored)\b/);
    if (m) console.log(`${m[1]}\t${m[2]}`);
  }
} else if (cmd === 'vitest-parse') {
  const json = JSON.parse(fs.readFileSync(arg1, 'utf8'));
  for (const file of json.testResults || []) {
    for (const t of file.assertionResults || []) {
      console.log(`${t.fullName}\t${t.status === 'passed' ? 'ok' : t.status === 'failed' ? 'FAILED' : 'skipped'}`);
    }
  }
} else if (cmd === 'pw-parse') {
  const json = JSON.parse(fs.readFileSync(arg1, 'utf8'));
  const walk = (suite, trail) => {
    const here = suite.title && !suite.title.endsWith('.spec.ts') ? [...trail, suite.title] : trail;
    for (const spec of suite.specs || []) {
      const test = (spec.tests || [])[0];
      const status = test?.status === 'skipped' ? 'skipped' : spec.ok ? 'ok' : 'FAILED';
      console.log(`${[...here, spec.title].join(' > ')}\t${status}`);
    }
    for (const child of suite.suites || []) walk(child, here);
  };
  for (const s of json.suites || []) walk(s, []);
} else if (cmd === 'tc-count') {
  const text = strip(fs.readFileSync(arg1, 'utf8'));
  const m = text.match(/Found (\d+) errors?\./);
  console.log(m ? m[1] : '0');
} else if (cmd === 'baseline') {
  let v = loadKnown();
  for (const k of arg1.split('.')) v = v?.[k];
  console.log(v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
} else if (cmd === 'compare') {
  const known = new Set((loadKnown()[arg1] || {}).known_failing_tests || []);
  const rows = fs
    .readFileSync(arg2, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));
  const failed = new Set(rows.filter((r) => r[1] === 'FAILED').map((r) => r[0]));
  const passed = new Set(rows.filter((r) => r[1] === 'ok').map((r) => r[0]));
  for (const n of failed) console.log(`${known.has(n) ? 'KNOWN' : 'NEW'}\t${n}`);
  for (const n of known) if (passed.has(n)) console.log(`FIXED\t${n}`);
} else {
  console.error('unknown command');
  process.exit(2);
}
