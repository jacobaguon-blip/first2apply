/**
 * Quiet-hours unit tests.
 *
 * Run with:  npx tsx apps/desktopProbe/src/server/notifications/quietHours.test.ts
 *
 * Uses a tiny inline assertion harness (no external test runner) so the file
 * is portable across the desktopProbe build setup.
 */
import type { QuietHoursSchedule } from '@first2apply/core';

import { isInQuietHours } from './quietHours';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'assertEqual'} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

/**
 * Build a UTC Date that, when projected into `tz`, lands on the given local
 * y-m-d-h-m. We do this by binary-searching offset minutes — small (< 1s)
 * and works regardless of DST.
 */
function localToUtc(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): Date {
  // Start from the wall-clock as if it were UTC, then correct.
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
    // shift guess by -drift
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

console.log('quietHours.test.ts');

test('22:00→07:00 wrap, now=02:00 local → in window', () => {
  const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 2, 0); // Tue 02:00
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now), true);
});

test('22:00→07:00 wrap, now=12:00 local → NOT in window', () => {
  const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 12, 0);
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now), false);
});

test('DST spring-forward: 03:30 PT on 2026-03-08 still inside 22:00→07:00 window', () => {
  // 2026-03-08 02:00 PT does not exist (clocks jump to 03:00). 03:30 PT is valid
  // and should still be inside the wrap window that started Saturday 22:00 PT.
  const now = localToUtc('America/Los_Angeles', 2026, 3, 8, 3, 30);
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now), true);
});

test('DST fall-back: 06:30 PT on 2026-11-01 still inside wrap window', () => {
  // 2026-11-01: clocks fall back at 02:00. 06:30 should still be quiet.
  const now = localToUtc('America/Los_Angeles', 2026, 11, 1, 6, 30);
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 0, now), true);
});

test('Empty schedule → always false', () => {
  const now = new Date();
  assertEqual(isInQuietHours({}, 'America/Los_Angeles', 0, now), false);
});

test('1-hour grace pushes 07:00 end → still quiet at 07:30', () => {
  const now = localToUtc('America/Los_Angeles', 2026, 5, 5, 7, 30);
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'America/Los_Angeles', 60, now), true);
});

test('Asia/Tokyo: 23:00 local Tue is inside 22:00→07:00 window for that tz', () => {
  const now = localToUtc('Asia/Tokyo', 2026, 5, 5, 23, 0);
  assertEqual(isInQuietHours(NIGHTLY_22_07, 'Asia/Tokyo', 0, now), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
