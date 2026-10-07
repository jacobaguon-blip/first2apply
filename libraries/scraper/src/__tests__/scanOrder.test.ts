import { Link } from '@first2apply/core';
import { describe, expect, it } from 'vitest';

import { prioritizeLinks } from '../scanOrder';

const link = (id: number, site_id: number) => ({ id, site_id }) as Link;
const sites = [
  { id: 1, provider: 'linkedin' },
  { id: 3, provider: 'indeed' },
  { id: 17, provider: 'custom' },
];

describe('prioritizeLinks', () => {
  it('puts non-custom links before custom ones', () => {
    const result = prioritizeLinks([link(1, 17), link(2, 17), link(3, 1), link(4, 3)], sites);
    expect(result.map((l) => l.id)).toEqual([3, 4, 1, 2]);
  });

  it('keeps the original order inside each group (stable)', () => {
    const result = prioritizeLinks([link(9, 17), link(5, 1), link(8, 17), link(2, 3), link(7, 1)], sites);
    expect(result.map((l) => l.id)).toEqual([5, 2, 7, 9, 8]);
  });

  it('treats unknown sites as non-custom and does not mutate the input', () => {
    const input = [link(1, 17), link(2, 999)];
    const result = prioritizeLinks(input, sites);
    expect(result.map((l) => l.id)).toEqual([2, 1]);
    expect(input.map((l) => l.id)).toEqual([1, 2]);
  });

  it('returns the input order when there are no sites', () => {
    expect(prioritizeLinks([link(1, 17), link(2, 1)], []).map((l) => l.id)).toEqual([1, 2]);
  });
});
