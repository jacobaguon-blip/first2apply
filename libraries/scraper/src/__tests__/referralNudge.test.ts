import { describe, expect, it, vi } from 'vitest';

import { runReferralNudge } from '../referralNudge';

type Row = {
  id: number;
  user_id: string;
  status: string;
  follow_up_at: string | null;
  last_nudged_at: string | null;
  connections: { first_name: string; company: string } | null;
};

const NOW = new Date('2026-10-08T15:00:00.000Z');
const row = (id: number, over: Partial<Row> = {}): Row => ({
  id,
  user_id: 'u1',
  status: 'asked',
  follow_up_at: '2026-10-07T12:00:00.000Z',
  last_nudged_at: null,
  connections: { first_name: `P${id}`, company: `Co${id}` },
  ...over,
});

/**
 * Hand-written fake of only the chained calls runReferralNudge makes:
 *  referral_outreach: select().eq().lte().or().order().limit()  (awaited)
 *  referral_outreach: update(p).eq('id').or(..).select('id')   (claim, evaluated against the stored row)
 *  referral_outreach: update(p).eq('id').eq('last_nudged_at')  (rollback, only where the stamp is still ours)
 *  user_settings: select().eq().maybeSingle()
 */
function makeFake(rows: Row[], settings: Record<string, unknown> | null = null) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const log = {
    selectCalls: [] as Array<unknown[]>,
    updates: [] as Array<{ payload: any; id?: number }>,
  };
  let onSelect: (() => void) | undefined;

  const outreach = () => {
    let payload: any;
    let id: number | undefined;
    let rollbackExpect: string | undefined;
    const b: any = {
      select(arg?: string) {
        if (payload === undefined) {
          log.selectCalls.push(['select', arg]);
          return b;
        }
        // claim: .update().eq().or().select('id')
        const cur = store.get(id!);
        const ok =
          !!cur && (cur.last_nudged_at === null || cur.last_nudged_at < new Date(cur.follow_up_at!).toISOString());
        if (ok) cur!.last_nudged_at = payload.last_nudged_at;
        log.updates.push({ payload, id });
        return Promise.resolve({ data: ok ? [{ id }] : [], error: null });
      },
      update(p: any) {
        payload = p;
        return b;
      },
      eq(col: string, val: any) {
        if (payload === undefined) log.selectCalls.push(['eq', col, val]);
        else if (col === 'id') id = val;
        else if (col === 'last_nudged_at') rollbackExpect = val;
        return b;
      },
      lte: (...a: unknown[]) => (log.selectCalls.push(['lte', ...a]), b),
      or(expr: string) {
        if (payload === undefined) log.selectCalls.push(['or', expr]);
        return b;
      },
      order: (...a: unknown[]) => (log.selectCalls.push(['order', ...a]), b),
      limit: (...a: unknown[]) => (log.selectCalls.push(['limit', ...a]), b),
      then(resolve: (v: unknown) => void) {
        if (payload === undefined) {
          const snapshot = [...store.values()].map((r) => ({ ...r }));
          onSelect?.();
          return resolve({ data: snapshot, error: null });
        }
        // rollback (awaited without .select)
        log.updates.push({ payload, id });
        const cur = store.get(id!);
        if (cur && cur.last_nudged_at === rollbackExpect) cur.last_nudged_at = payload.last_nudged_at;
        return resolve({ data: null, error: null });
      },
    };
    return b;
  };

  const userSettings = () => {
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: settings, error: null }),
    };
    return b;
  };

  const supabase = { from: (t: string) => (t === 'referral_outreach' ? outreach() : userSettings()) } as any;
  return {
    supabase,
    store,
    log,
    setOnSelect: (fn: () => void) => {
      onSelect = fn;
    },
  };
}

const logger = () => ({ info: vi.fn(), error: vi.fn() });
const pushover = { appToken: 'a', userKey: 'k' };
const run = (fake: ReturnType<typeof makeFake>, send: any) =>
  runReferralNudge({ supabase: fake.supabase, logger: logger(), pushover, now: NOW, sendPushover: send });

describe('runReferralNudge', () => {
  it('sends nothing and writes nothing when nothing is due', async () => {
    const fake = makeFake([row(1, { follow_up_at: '2026-10-20T00:00:00.000Z' })]);
    const send = vi.fn();
    expect(await run(fake, send)).toEqual({ nudged: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(fake.log.updates).toEqual([]);
  });

  it('sends one message for two due rows and stamps both', async () => {
    const fake = makeFake([row(1), row(2)]);
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await run(fake, send)).toEqual({ nudged: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].title).toBe('Follow up on 2 referral requests');
    expect(fake.store.get(1)!.last_nudged_at).toBe(NOW.toISOString());
    expect(fake.store.get(2)!.last_nudged_at).toBe(NOW.toISOString());
  });

  it('skips a row already nudged for its current follow_up_at', async () => {
    const fake = makeFake([row(1, { last_nudged_at: '2026-10-07T13:00:00.000Z' }), row(2)]);
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await run(fake, send)).toEqual({ nudged: 1 });
    expect(fake.log.updates.map((u) => u.id)).toEqual([2]);
    expect(fake.store.get(1)!.last_nudged_at).toBe('2026-10-07T13:00:00.000Z');
  });

  it('skips a user in quiet hours and leaves the row unstamped', async () => {
    const day = { start: '00:00', end: '23:59' };
    const schedule = Object.fromEntries(
      ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [d, day]),
    );
    const fake = makeFake([row(1)], {
      user_id: 'u1',
      quiet_hours_enabled: true,
      quiet_hours_timezone: 'UTC',
      quiet_hours_schedule: schedule,
      quiet_hours_grace_minutes: 0,
    });
    const send = vi.fn();
    expect(await run(fake, send)).toEqual({ nudged: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(fake.store.get(1)!.last_nudged_at).toBeNull();
    expect(fake.log.updates).toEqual([]);
  });

  it('sends nothing when another process already claimed the row', async () => {
    const fake = makeFake([row(1)]);
    // Between our select and our claim, another probe stamps the row.
    fake.setOnSelect(() => {
      fake.store.get(1)!.last_nudged_at = '2026-10-08T14:59:00.000Z';
    });
    const send = vi.fn();
    expect(await run(fake, send)).toEqual({ nudged: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(fake.store.get(1)!.last_nudged_at).toBe('2026-10-08T14:59:00.000Z');
  });

  it('sends only for the rows this process claimed', async () => {
    const fake = makeFake([row(1), row(2)]);
    fake.setOnSelect(() => {
      fake.store.get(1)!.last_nudged_at = '2026-10-08T14:59:00.000Z';
    });
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await run(fake, send)).toEqual({ nudged: 1 });
    expect(send.mock.calls[0][0].message).toContain('P2 at Co2');
    expect(send.mock.calls[0][0].message).not.toContain('P1');
  });

  it('rolls back the stamps and rethrows when the send fails, so the next run retries', async () => {
    const prev = '2026-10-01T00:00:00.000Z';
    const fake = makeFake([row(1, { last_nudged_at: prev }), row(2)]);
    const send = vi.fn().mockRejectedValue(new Error('pushover down'));
    await expect(run(fake, send)).rejects.toThrow('pushover down');
    expect(fake.store.get(1)!.last_nudged_at).toBe(prev);
    expect(fake.store.get(2)!.last_nudged_at).toBeNull();

    const ok = vi.fn().mockResolvedValue(undefined);
    expect(await run(fake, ok)).toEqual({ nudged: 2 });
  });

  it('uses a bounded, ordered due query with a server-side last_nudged_at filter', async () => {
    const fake = makeFake([]);
    await run(fake, vi.fn());
    const calls = fake.log.selectCalls;
    expect(calls).toContainEqual(['limit', 500]);
    expect(calls).toContainEqual(['order', 'follow_up_at']);
    expect(calls).toContainEqual(['or', `last_nudged_at.is.null,last_nudged_at.lt.${NOW.toISOString()}`]);
    expect(calls).toContainEqual(['lte', 'follow_up_at', NOW.toISOString()]);
  });
});
