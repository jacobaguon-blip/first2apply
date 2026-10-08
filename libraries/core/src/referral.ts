export const REFERRAL_STATUSES = ['drafted', 'asked', 'replied', 'referred', 'no_reply', 'declined'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const DEFAULT_FOLLOW_UP_DAYS = 7;

export type OutreachPatch = {
  status: ReferralStatus;
  asked_at?: string;
  follow_up_at?: string | null;
};

/**
 * Fields to write when the user changes an outreach status.
 * asked: stamp asked_at and a follow-up date (keeping any existing values).
 * replied/referred/no_reply/declined: clear the follow-up so nobody gets nudged.
 * drafted: status only.
 */
export function nextOutreachFields(
  status: ReferralStatus,
  now: Date = new Date(),
  followUpDays: number = DEFAULT_FOLLOW_UP_DAYS,
  current?: { asked_at?: string | null; follow_up_at?: string | null },
): OutreachPatch {
  if (status === 'asked') {
    const followUp = new Date(now.getTime() + followUpDays * 24 * 60 * 60 * 1000);
    return {
      status,
      asked_at: current?.asked_at ?? now.toISOString(),
      follow_up_at: current?.follow_up_at ?? followUp.toISOString(),
    };
  }
  if (status === 'drafted') return { status };
  return { status, follow_up_at: null };
}

export type DueCandidate = {
  status: string;
  follow_up_at: string | null;
  last_nudged_at: string | null;
};

/** Rows that need a follow-up nudge: asked, follow-up date passed, not yet nudged for that date. */
export function selectDueOutreach<T extends DueCandidate>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter((row) => {
    if (row.status !== 'asked' || !row.follow_up_at) return false;
    const due = new Date(row.follow_up_at).getTime();
    if (due > now.getTime()) return false;
    if (!row.last_nudged_at) return true;
    return new Date(row.last_nudged_at).getTime() < due;
  });
}

export function buildNudgeMessage(people: Array<{ firstName: string; company: string }>): {
  title: string;
  message: string;
} {
  const count = people.length;
  const names = people.slice(0, 3).map((p) => `${p.firstName} at ${p.company}`);
  const more = count > 3 ? ` and ${count - 3} more` : '';
  return {
    title: `Follow up on ${count} referral ${count === 1 ? 'request' : 'requests'}`,
    message: `Time to follow up with ${names.join(', ')}${more}.`,
  };
}
