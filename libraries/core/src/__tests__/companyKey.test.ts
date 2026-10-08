import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { companyKey, sameCompany } from '../companyKey';

const fixtures: Array<{ input: string | null; key: string }> = JSON.parse(
  readFileSync(join(__dirname, '..', '__fixtures__', 'companyKey.fixtures.json'), 'utf8'),
);

describe('companyKey', () => {
  it.each(fixtures.map((f) => [f.input, f.key] as const))('%j -> %j', (input, key) => {
    expect(companyKey(input)).toBe(key);
  });

  it('never merges look-alike names', () => {
    expect(sameCompany('Meta Platforms, Inc.', 'Metaverse Labs')).toBe(false);
  });

  it('merges spelling variants of the same company', () => {
    expect(sameCompany('REI Co-op', 'REI, Inc.')).toBe(true);
  });

  it('treats empty keys as not the same company', () => {
    expect(sameCompany('', '')).toBe(false);
    expect(sameCompany(null, undefined)).toBe(false);
  });
});
