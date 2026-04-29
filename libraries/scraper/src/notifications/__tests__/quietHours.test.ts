import { describe, it, expect } from 'vitest';
import type { QuietHoursSchedule } from '@first2apply/core';

import { isInQuietHours, nextWindowEnd } from '../quietHours';

const tz = 'America/Los_Angeles';

const sched = (s: QuietHoursSchedule): QuietHoursSchedule => s;

describe('isInQuietHours', () => {
  it('returns false for an empty schedule', () => {
    expect(isInQuietHours({}, tz, 0, new Date())).toBe(false);
  });

  it('detects a same-day window: inside', () => {
    // 2026-04-22 is Wed. LA in DST → UTC-7. 12:00 PT == 19:00 UTC.
    const now = new Date('2026-04-22T19:00:00Z');
    expect(
      isInQuietHours(sched({ wednesday: { start: '09:00', end: '17:00' } }), tz, 0, now),
    ).toBe(true);
  });

  it('detects a same-day window: outside', () => {
    // 18:00 PT Wed == 2026-04-23T01:00Z
    const now = new Date('2026-04-23T01:00:00Z');
    expect(
      isInQuietHours(sched({ wednesday: { start: '09:00', end: '17:00' } }), tz, 0, now),
    ).toBe(false);
  });

  it('detects a midnight-wrap window from the previous day', () => {
    // Mon 22:00 → Tue 07:00. Tue 03:00 PT == 2026-04-21T10:00Z (DST).
    const now = new Date('2026-04-21T10:00:00Z');
    expect(
      isInQuietHours(sched({ monday: { start: '22:00', end: '07:00' } }), tz, 0, now),
    ).toBe(true);
  });

  it('grace minutes extend the window end outward', () => {
    // 17:30 PT Wed == 2026-04-23T00:30Z. Outside w/ grace=0, inside w/ grace=60.
    const now = new Date('2026-04-23T00:30:00Z');
    const s = sched({ wednesday: { start: '09:00', end: '17:00' } });
    expect(isInQuietHours(s, tz, 0, now)).toBe(false);
    expect(isInQuietHours(s, tz, 60, now)).toBe(true);
  });

  it('handles a foreign timezone (Europe/London midnight-wrap)', () => {
    // 2026-04-21 02:30 BST (Mon, BST is UTC+1) == 2026-04-21T01:30Z. Mon 22:00 → Tue 07:00 wrap.
    const now = new Date('2026-04-21T01:30:00Z');
    expect(
      isInQuietHours(
        sched({ monday: { start: '22:00', end: '07:00' } }),
        'Europe/London',
        0,
        now,
      ),
    ).toBe(true);
  });

  it('handles DST spring-forward (post-shift wall clock is honored)', () => {
    // 2026 US DST begins Sun Mar 8 02:00 → 03:00. Sat 23:00 → Sun 04:00 wrap window.
    // 03:30 PDT Sun == 2026-03-08T10:30Z. Should still be inside (before 04:00 end).
    const now = new Date('2026-03-08T10:30:00Z');
    expect(
      isInQuietHours(sched({ saturday: { start: '23:00', end: '04:00' } }), tz, 0, now),
    ).toBe(true);
  });
});

describe('nextWindowEnd', () => {
  it('returns null when not currently in a window', () => {
    const now = new Date('2026-04-23T01:00:00Z'); // 18:00 PT Wed
    expect(
      nextWindowEnd(sched({ wednesday: { start: '09:00', end: '17:00' } }), tz, now),
    ).toBeNull();
  });

  it('returns a Date close to the configured end while inside', () => {
    const now = new Date('2026-04-22T19:00:00Z'); // 12:00 PT Wed
    const end = nextWindowEnd(sched({ wednesday: { start: '09:00', end: '17:00' } }), tz, now);
    expect(end).not.toBeNull();
    // 17:00 PT Wed == 2026-04-23T00:00Z. Minute-step search → tolerate 2 minutes.
    expect(Math.abs((end as Date).getTime() - new Date('2026-04-23T00:00:00Z').getTime())).toBeLessThan(
      120_000,
    );
  });
});
