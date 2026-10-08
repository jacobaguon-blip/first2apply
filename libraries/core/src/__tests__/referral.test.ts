import { describe, expect, it } from '@jest/globals';

import { buildNudgeMessage, DEFAULT_FOLLOW_UP_DAYS, nextOutreachFields, selectDueOutreach } from '../referral';

const NOW = new Date('2026-10-08T12:00:00Z');

describe('nextOutreachFields', () => {
  it('sets asked_at and a follow-up date when marked asked', () => {
    const patch = nextOutreachFields('asked', NOW);
    expect(patch.status).toBe('asked');
    expect(patch.asked_at).toBe('2026-10-08T12:00:00.000Z');
    expect(patch.follow_up_at).toBe('2026-10-15T12:00:00.000Z');
    expect(DEFAULT_FOLLOW_UP_DAYS).toBe(7);
  });

  it('keeps an existing asked_at and follow_up_at', () => {
    const patch = nextOutreachFields('asked', NOW, 7, {
      asked_at: '2026-10-01T00:00:00.000Z',
      follow_up_at: '2026-10-20T00:00:00.000Z',
    });
    expect(patch.asked_at).toBe('2026-10-01T00:00:00.000Z');
    expect(patch.follow_up_at).toBe('2026-10-20T00:00:00.000Z');
  });

  it('stops nudging once there is an outcome', () => {
    for (const status of ['replied', 'referred', 'no_reply', 'declined'] as const) {
      expect(nextOutreachFields(status, NOW).follow_up_at).toBeNull();
    }
  });

  it('changes nothing but status for drafted', () => {
    expect(nextOutreachFields('drafted', NOW)).toEqual({ status: 'drafted' });
  });
});

describe('selectDueOutreach', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    status: 'asked',
    follow_up_at: '2026-10-08T00:00:00.000Z',
    last_nudged_at: null,
    ...over,
  });

  it('selects asked rows whose follow-up date has passed and were never nudged', () => {
    expect(selectDueOutreach([row({})], NOW)).toHaveLength(1);
  });

  it('skips rows not yet due, not asked, or without a follow-up date', () => {
    expect(selectDueOutreach([row({ follow_up_at: '2026-10-09T00:00:00.000Z' })], NOW)).toHaveLength(0);
    expect(selectDueOutreach([row({ status: 'replied' })], NOW)).toHaveLength(0);
    expect(selectDueOutreach([row({ follow_up_at: null })], NOW)).toHaveLength(0);
  });

  it('nudges once per follow-up date, and again if the date is pushed out and passes', () => {
    expect(selectDueOutreach([row({ last_nudged_at: '2026-10-08T06:00:00.000Z' })], NOW)).toHaveLength(0);
    expect(
      selectDueOutreach(
        [row({ follow_up_at: '2026-10-08T09:00:00.000Z', last_nudged_at: '2026-10-07T06:00:00.000Z' })],
        NOW,
      ),
    ).toHaveLength(1);
  });
});

describe('buildNudgeMessage', () => {
  it('names up to three people and counts the rest', () => {
    const msg = buildNudgeMessage([
      { firstName: 'Avery', company: 'REI' },
      { firstName: 'Sam', company: 'Acme' },
      { firstName: 'Jo', company: 'Meta' },
      { firstName: 'Lee', company: 'Stripe' },
    ]);
    expect(msg.title).toBe('Follow up on 4 referral requests');
    expect(msg.message).toBe('Time to follow up with Avery at REI, Sam at Acme, Jo at Meta and 1 more.');
  });

  it('uses the singular for one request', () => {
    expect(buildNudgeMessage([{ firstName: 'Avery', company: 'REI' }]).title).toBe('Follow up on 1 referral request');
  });
});
