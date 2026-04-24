import { DateTime } from 'luxon';
import { isInQuietHours, windowEndFor, windowStartFor, mostRecentWindowEnd } from '../../src/server/quietHours/predicate';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const tz = 'America/Los_Angeles';
const schedWith = (overrides: Partial<Record<keyof typeof DEFAULT_QUIET_HOURS.schedule, any>>) => ({
  ...DEFAULT_QUIET_HOURS.schedule,
  ...overrides,
});

test('same-day window: inside', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate(); // Wed
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('same-day window: outside', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T18:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(false);
});

test('midnight-spanning: rolls from Mon 22:00 into Tue 07:00', () => {
  const sched = schedWith({ mon: { enabled: true, start: '22:00', end: '07:00' } });
  // Tue 03:00 local is still inside Mon's window
  const now = DateTime.fromISO('2026-04-21T03:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('grace period collapses inside→outside near end', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T16:55', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 10)).toBe(false); // within 10min of 17:00
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('disabled day is never inside', () => {
  const sched = schedWith({ wed: { enabled: false, start: '00:00', end: '23:59' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(false);
});

test('DST spring-forward respects local wall clock', () => {
  // 2026 US spring-forward: Mar 8, 02:00 → 03:00. A 01:30–04:00 window on Sat->Sun test:
  const sched = schedWith({ sat: { enabled: true, start: '23:00', end: '04:00' } });
  const now = DateTime.fromISO('2026-03-08T03:30', { zone: tz }).toJSDate();
  expect(isInQuietHours(now, sched, tz, 0)).toBe(true);
});

test('windowEndFor returns current window end in local tz', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T12:00', { zone: tz }).toJSDate();
  const end = windowEndFor(now, sched, tz)!;
  expect(DateTime.fromJSDate(end).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm")).toBe('2026-04-22T17:00');
});

test('windowStartFor returns the start of the current window (midnight-spanning)', () => {
  const sched = schedWith({ mon: { enabled: true, start: '22:00', end: '07:00' } });
  // Tue 03:00 local is still inside Mon's window
  const now = DateTime.fromISO('2026-04-21T03:00', { zone: tz }).toJSDate();
  const start = windowStartFor(now, sched, tz)!;
  expect(start).not.toBeNull();
  expect(DateTime.fromJSDate(start).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm")).toBe('2026-04-20T22:00');
});

test('windowStartFor returns null when outside any window', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T18:00', { zone: tz }).toJSDate();
  expect(windowStartFor(now, sched, tz)).toBeNull();
});

test('mostRecentWindowEnd returns the last ended window before now', () => {
  const sched = schedWith({ wed: { enabled: true, start: '09:00', end: '17:00' } });
  const now = DateTime.fromISO('2026-04-22T20:00', { zone: tz }).toJSDate();
  const end = mostRecentWindowEnd(now, sched, tz)!;
  expect(DateTime.fromJSDate(end).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm")).toBe('2026-04-22T17:00');
});
