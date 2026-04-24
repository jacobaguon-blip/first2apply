import { PushoverSummaryScheduler } from '../../src/server/quietHours/summaryScheduler';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

const settings = {
  ...DEFAULT_QUIET_HOURS,
  enabled: true,
  timezone: 'UTC',
  schedule: { ...DEFAULT_QUIET_HOURS.schedule, wed: { enabled: true, start: '09:00', end: '17:00' } },
  pushoverOwnerDeviceId: 'dev-A',
};

function makeSb(claimReturns: number[]) {
  const calls = { claim: 0, stamp: 0, loadJobs: 0 };
  let claimIdx = 0;
  const sb: any = {
    rpc: async (name: string) => {
      if (name === 'claim_summary_send') { calls.claim++; return { data: claimReturns[claimIdx++], error: null }; }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            gte: () => ({
              lt: async () => ({
                data: [{ siteName: 'LinkedIn', searchTitle: 'Frontend' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
      update: () => ({ eq: () => ({ is: async () => ({ data: null, error: null, count: 1 }) }) }),
    }),
    _calls: calls,
  };
  return sb;
}

test('owner sends summary once, dedupes subsequent ticks', async () => {
  const sb = makeSb([1, 0]);
  const sendPushover = jest.fn().mockResolvedValue(undefined);
  const scheduler = new PushoverSummaryScheduler({ supabase: sb, userId: 'u', deviceId: 'dev-A', sendPushover });
  const now = new Date('2026-04-22T18:00:00Z');
  await scheduler.tick({ now, settings });
  await scheduler.tick({ now, settings });
  expect(sendPushover).toHaveBeenCalledTimes(1);
});

test('non-owner device never sends', async () => {
  const sb = makeSb([1]);
  const sendPushover = jest.fn();
  const scheduler = new PushoverSummaryScheduler({ supabase: sb, userId: 'u', deviceId: 'dev-B', sendPushover });
  await scheduler.tick({ now: new Date('2026-04-22T18:00:00Z'), settings });
  expect(sendPushover).not.toHaveBeenCalled();
});
