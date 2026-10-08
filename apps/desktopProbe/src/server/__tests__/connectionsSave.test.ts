import { describe, expect, it } from 'vitest';

import { type ConnectionInput, chunk, prepareConnections, validIsoDate } from '../connectionsSave';

const row = (url: string, extra: Partial<ConnectionInput> = {}): ConnectionInput => ({
  firstName: 'A',
  lastName: 'B',
  url,
  company: 'Acme',
  position: 'Eng',
  connectedOnIso: '2024-01-02',
  ...extra,
});

describe('prepareConnections', () => {
  it('keeps the last row for duplicate urls and counts the dropped ones', () => {
    const r = prepareConnections([
      row('https://x/a', { firstName: 'First' }),
      row('https://x/b'),
      row('https://x/a', { firstName: 'Last' }),
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.find((x) => x.url === 'https://x/a')?.firstName).toBe('Last');
    expect(r.duplicatesDropped).toBe(1);
  });

  it('treats whitespace and case differences as the same url', () => {
    const r = prepareConnections([row('  https://X/A '), row('https://x/a')]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].url).toBe('https://x/a');
    expect(r.duplicatesDropped).toBe(1);
  });

  it('skips rows without a url and does not count them as duplicates', () => {
    const r = prepareConnections([row(''), row('   '), row(undefined as unknown as string), row('https://x/a')]);
    expect(r.rows).toHaveLength(1);
    expect(r.skippedNoUrl).toBe(3);
    expect(r.duplicatesDropped).toBe(0);
  });

  it('nulls invalid dates', () => {
    const r = prepareConnections([
      row('https://x/a', { connectedOnIso: '01/02/2024' }),
      row('https://x/b', { connectedOnIso: null }),
    ]);
    expect(r.rows.map((x) => x.connectedOnIso)).toEqual([null, null]);
  });
});

describe('validIsoDate', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(validIsoDate('2024-05-06')).toBe('2024-05-06');
    expect(validIsoDate('2024-05-06T00:00:00Z')).toBeNull();
    expect(validIsoDate('')).toBeNull();
    expect(validIsoDate(5)).toBeNull();
  });
});

describe('chunk', () => {
  it('splits at 500 by default', () => {
    const parts = chunk(Array.from({ length: 1201 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([500, 500, 201]);
  });
  it('returns no chunks for empty input', () => {
    expect(chunk([])).toEqual([]);
  });
});
