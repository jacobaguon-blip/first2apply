import { describe, expect, it } from 'vitest';

import { dateInputToIso, isoToDateInput } from '../../lib/referralDates';

describe('referralDates', () => {
  it('round-trips a date input value', () => {
    expect(isoToDateInput(dateInputToIso('2026-10-15'))).toBe('2026-10-15');
  });

  it('returns null for empty or invalid input', () => {
    expect(dateInputToIso('')).toBeNull();
    expect(dateInputToIso('2026-02-31')).toBeNull();
    expect(dateInputToIso('nope')).toBeNull();
  });

  it('returns empty string for missing or invalid ISO', () => {
    expect(isoToDateInput(null)).toBe('');
    expect(isoToDateInput('garbage')).toBe('');
  });
});
