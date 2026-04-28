import type { QuietHoursSchedule, QuietHoursDay, QuietHoursWindow } from '@first2apply/core';

const DAY_ORDER: QuietHoursDay[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
};

/**
 * Compute the local-time parts for a Date in the given IANA timezone.
 *
 * Uses Intl.DateTimeFormat (no luxon / date-fns-tz) so DST transitions are handled
 * by the runtime ICU data.
 */
function getLocalParts(now: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const hour = parseInt(get('hour'), 10);
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    // Intl sometimes reports 24 for midnight on some ICU versions
    hour: hour === 24 ? 0 : hour,
    minute: parseInt(get('minute'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

function parseHHMM(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/**
 * Add a number of minutes to an HH:MM-of-day, returning minutes-of-day modulo 24h.
 */
function minutesOfDay(h: number, m: number): number {
  return h * 60 + m;
}

/**
 * Returns the previous day in the cycle (sunday wraps to saturday).
 */
function previousDay(day: QuietHoursDay): QuietHoursDay {
  const idx = DAY_ORDER.indexOf(day);
  return DAY_ORDER[(idx + 6) % 7];
}

function dayFromWeekdayIndex(idx: number): QuietHoursDay {
  return DAY_ORDER[((idx % 7) + 7) % 7];
}

/**
 * Determine whether `now` (a UTC Date) falls inside a quiet-hours window for
 * the user's local schedule.
 *
 * - Empty schedule → false.
 * - `start > end` denotes a window that crosses midnight: it starts on the
 *   listed day at `start` and ends on the *following* calendar day at `end`.
 * - `graceMinutes` extends the *end* of the active window outward (so a 07:00
 *   end with 60 min grace stays quiet until 08:00).
 */
export function isInQuietHours(
  schedule: QuietHoursSchedule,
  timezone: string,
  graceMinutes: number,
  now: Date,
): boolean {
  if (!schedule || Object.keys(schedule).length === 0) return false;
  const local = getLocalParts(now, timezone);
  const nowMin = minutesOfDay(local.hour, local.minute);
  const today = dayFromWeekdayIndex(local.weekday);
  const yesterday = previousDay(today);

  // Case 1: a window that started yesterday and wraps into today.
  const yWin = schedule[yesterday];
  if (yWin) {
    const s = parseHHMM(yWin.start);
    const e = parseHHMM(yWin.end);
    if (s && e) {
      const startMin = minutesOfDay(s.h, s.m);
      const endMin = minutesOfDay(e.h, e.m);
      if (startMin > endMin) {
        // wrap window: from yesterday startMin → today endMin (+grace)
        if (nowMin < endMin + graceMinutes) return true;
      }
    }
  }

  // Case 2: a window that starts today.
  const tWin = schedule[today];
  if (tWin) {
    const s = parseHHMM(tWin.start);
    const e = parseHHMM(tWin.end);
    if (s && e) {
      const startMin = minutesOfDay(s.h, s.m);
      const endMin = minutesOfDay(e.h, e.m);
      if (startMin <= endMin) {
        // same-day window: [start, end + grace)
        if (nowMin >= startMin && nowMin < endMin + graceMinutes) return true;
      } else {
        // wrap window started today: still in [start, 24:00)
        if (nowMin >= startMin) return true;
      }
    }
  }

  return false;
}

/**
 * Best-effort: compute the UTC Date when the *currently active* quiet-hours
 * window ends (including grace). Returns null if not currently in a window.
 *
 * Implementation note: we step minute-by-minute up to 48 hours forward; this
 * is fine for the maximum 24h+grace window length and avoids reimplementing
 * tz-aware arithmetic.
 */
export function nextWindowEnd(
  schedule: QuietHoursSchedule,
  timezone: string,
  now: Date,
): Date | null {
  // Pull grace from the schedule? No — caller passes 0 here; window-end ignoring
  // grace is the contract. Callers that want grace can add it themselves.
  if (!isInQuietHours(schedule, timezone, 0, now)) {
    // If not currently quiet, there is no active window to "end".
    return null;
  }
  const stepMs = 60_000;
  const maxSteps = 60 * 48; // 48h ceiling
  for (let i = 1; i <= maxSteps; i++) {
    const candidate = new Date(now.getTime() + i * stepMs);
    if (!isInQuietHours(schedule, timezone, 0, candidate)) {
      return candidate;
    }
  }
  return null;
}
