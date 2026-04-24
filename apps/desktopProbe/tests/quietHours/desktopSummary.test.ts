import { DesktopSummaryTracker } from '../../src/server/quietHours/desktopSummary';

test('fires summary on inside→outside transition', async () => {
  const notify = jest.fn();
  const loadJobs = jest.fn().mockResolvedValue([
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
  ]);
  const t = new DesktopSummaryTracker({ notify, loadJobsBetween: loadJobs });

  await t.tick({ isInside: true, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T10:00Z') });
  expect(notify).not.toHaveBeenCalled();

  await t.tick({ isInside: false, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T17:01Z') });
  expect(notify).toHaveBeenCalledTimes(1);
  const [total, groups] = notify.mock.calls[0];
  expect(total).toBe(2);
  expect(groups[0]).toMatchObject({ site: 'LinkedIn', count: 2 });
});

test('does not fire when no new jobs', async () => {
  const notify = jest.fn();
  const loadJobs = jest.fn().mockResolvedValue([]);
  const t = new DesktopSummaryTracker({ notify, loadJobsBetween: loadJobs });
  await t.tick({ isInside: true, windowStart: new Date(), now: new Date() });
  await t.tick({ isInside: false, windowStart: new Date('2026-04-22T09:00Z'), now: new Date('2026-04-22T17:01Z') });
  expect(notify).not.toHaveBeenCalled();
});
