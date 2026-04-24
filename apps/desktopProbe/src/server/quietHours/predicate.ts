import { DateTime } from 'luxon';
import { DayKey, QuietHoursSchedule } from '../../lib/types';

const DAY_KEYS: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun'];
const dayKeyOf = (dt: DateTime): DayKey => DAY_KEYS[(dt.weekday - 1) as 0|1|2|3|4|5|6];

type Interval = { start: DateTime; end: DateTime };

/** All windows that could be "current" at `now`: today's (if it has started) + yesterday's (if it spans midnight). */
function candidateWindows(now: DateTime, sched: QuietHoursSchedule): Interval[] {
  const out: Interval[] = [];
  for (const offset of [-1, 0]) {
    const base = now.plus({ days: offset }).startOf('day');
    const cfg = sched[dayKeyOf(base)];
    if (!cfg?.enabled) continue;
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const start = base.set({ hour: sh, minute: sm });
    let end = base.set({ hour: eh, minute: em });
    if (end <= start) end = end.plus({ days: 1 });
    out.push({ start, end });
  }
  return out;
}

export function isInQuietHours(now: Date, sched: QuietHoursSchedule, tz: string, graceMinutes: number): boolean {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  for (const w of candidateWindows(dt, sched)) {
    if (dt < w.start || dt >= w.end) continue;
    if (graceMinutes > 0 && w.end.diff(dt, 'minutes').minutes <= graceMinutes) return false;
    return true;
  }
  return false;
}

export function windowEndFor(now: Date, sched: QuietHoursSchedule, tz: string): Date | null {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  for (const w of candidateWindows(dt, sched)) {
    if (dt >= w.start && dt < w.end) return w.end.toJSDate();
  }
  return null;
}

export function mostRecentWindowEnd(now: Date, sched: QuietHoursSchedule, tz: string): Date | null {
  const dt = DateTime.fromJSDate(now).setZone(tz);
  // Check up to 8 days back to cover any schedule.
  let latest: DateTime | null = null;
  for (let offset = -8; offset <= 0; offset++) {
    const base = dt.plus({ days: offset }).startOf('day');
    const cfg = sched[dayKeyOf(base)];
    if (!cfg?.enabled) continue;
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const start = base.set({ hour: sh, minute: sm });
    let end = base.set({ hour: eh, minute: em });
    if (end <= start) end = end.plus({ days: 1 });
    if (end <= dt && (!latest || end > latest)) latest = end;
  }
  return latest ? latest.toJSDate() : null;
}
