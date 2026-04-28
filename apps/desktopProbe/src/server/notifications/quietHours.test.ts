/**
 * Quiet-hours unit tests (vitest).
 *
 * Migrated from the inline-harness pattern. Each `test()` from the original
 * is preserved as an `it()` with identical assertions.
 */
import { describe, it, expect } from 'vitest';
import type { QuietHoursSchedule } from '@first2apply/core';

import { isInQuietHours } from './quietHours';

/**
 * Build a UTC Date that, when projected into `tz`, lands on the given local
 * y-m-d-h-m. Binary-searches offset minutes — small (< 1s) and works
 * regardless of DST.
 */
function localToUtc(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = new Date(guess);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(candidate).map((p) => [p.type, p.value]));
    const localMs = Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
      parseInt(parts.minute, 10),
      0,
    );
    const targetMs = Date.UTC(y, mo - 1, d, h, mi, 0);
    const drift = localMs - targetMs;
    if (drift === 0) return candidate;
    return new Date(candidate.getTime() - drift);
  }
  return new Date(guess);
}

const NIGHTLY_22_07: QuietHoursSchedule = {
  monday: { start: '22:00', end: '07:00' },
  tuesday: { start: '22:00', end: '07:00' },
  wednesday: { start: '22:00', end: '07:00' },
  thursday: { start: '22:00', end: '07:00' },
  friday: { start: '22:00', end: '07:00' },
  saturday: { start: '22:00', end: '07:00' },
  sunday: { start: '22:00', end: '07:00' },
};

describe('isInQuietHours', () => {
  it('22:00→07:00 wrap, now=02:00 local → in window', () => {
    const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 2, 0);
    expect(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now)).toBe(true);
  });

  it('22:00→07:00 wrap, now=12:00 local → NOT in window', () => {
    const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 12, 0);
    expect(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now)).toBe(false);
  });

  it('DST spring-forward: 03:30 PT on 2026-03-08 still inside 22:00→07:00 window', () => {
    const now = localToUtc('America/Los_Angeles', 2026, 3, 8, 3, 30);
    expect(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now)).toBe(true);
  });

  it('DST fall-back: 06:30 PT on 2026-11-01 still inside wrap window', () => {
    const now = localToUtc('America/Los_Angeles', 2026, 11, 1, 6, 30);
    expect(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now)).toBe(true);
  });

  it('Empty schedule → always false', () => {
    const now = new Date();
    expect(isInQuietHours({}, 'America/Los_Angeles', 0, now)).toBe(false);
  });

  it('1-hour grace pushes 07:00 end → still quiet at 07:30', () => {
    const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 7, 30);
    expect(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 60, now)).toBe(true);
  });

  it('Asia/Tokyo: 23:00 local Tue is inside 22:00→07:00 window for that tz', () => {
    const now = localToUtc('Asia/Tokyo', 2026, 5, 5, 23, 0);
    expect(isInQuietHours(NIGHTLY_22_07, 'Asia/Tokyo', 0, now)).toBe(true);
  });
});
