import { DayKey, QuietHoursDay, QuietHoursSchedule } from '../../lib/types';

const ALL: DayKey[] = ['mon','tue','wed','thu','fri','sat','sun'];
const WEEKDAYS: DayKey[] = ['mon','tue','wed','thu','fri'];

export function copyToAll(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of ALL) next[k] = { ...day };
  return next;
}

export function copyToWeekdays(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of WEEKDAYS) next[k] = { ...day };
  return next;
}
