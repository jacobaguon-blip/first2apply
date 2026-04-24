import { copyToAll, copyToWeekdays } from '../../src/server/quietHours/schedule';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const src = { enabled: true, start: '22:00', end: '07:00' };

test('copyToAll overwrites every day', () => {
  const out = copyToAll(DEFAULT_QUIET_HOURS.schedule, src);
  for (const k of ['mon','tue','wed','thu','fri','sat','sun'] as const) {
    expect(out[k]).toEqual(src);
  }
});

test('copyToWeekdays overwrites mon-fri and leaves sat/sun', () => {
  const out = copyToWeekdays(DEFAULT_QUIET_HOURS.schedule, src);
  for (const k of ['mon','tue','wed','thu','fri'] as const) expect(out[k]).toEqual(src);
  expect(out.sat).toEqual(DEFAULT_QUIET_HOURS.schedule.sat);
  expect(out.sun).toEqual(DEFAULT_QUIET_HOURS.schedule.sun);
});

test('copyToAll does not mutate input', () => {
  const original = JSON.parse(JSON.stringify(DEFAULT_QUIET_HOURS.schedule));
  copyToAll(DEFAULT_QUIET_HOURS.schedule, src);
  expect(DEFAULT_QUIET_HOURS.schedule).toEqual(original);
});
