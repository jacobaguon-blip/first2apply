import { buildNudgeMessage, selectDueOutreach } from '@first2apply/core';
import type { DbSchema } from '@first2apply/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchUserSettings } from './notifications/dispatch';
import { isInQuietHours } from './notifications/quietHours';
import { sendPushover as realSendPushover } from './pushover';

export type ReferralNudgeLogger = {
  info: (m: string, meta?: Record<string, unknown>) => void;
  error: (m: string, meta?: Record<string, unknown>) => void;
};

type OutreachWithContact = {
  id: number;
  user_id: string;
  status: string;
  follow_up_at: string | null;
  last_nudged_at: string | null;
  connections: { first_name: string; company: string } | null;
};

const DUE_QUERY_LIMIT = 500;

type SendPushover = typeof realSendPushover;

/** Finds due follow-ups, sends one Pushover summary, and stamps last_nudged_at so each date nudges once. */
export async function runReferralNudge({
  supabase,
  logger,
  pushover,
  now = new Date(),
  sendPushover = realSendPushover,
}: {
  supabase: SupabaseClient<DbSchema>;
  logger: ReferralNudgeLogger;
  pushover: { appToken: string; userKey: string };
  now?: Date;
  sendPushover?: SendPushover;
}): Promise<{ nudged: number }> {
  const { data, error } = await supabase
    .from('referral_outreach')
    .select('id, user_id, status, follow_up_at, last_nudged_at, connections(first_name, company)')
    .eq('status', 'asked')
    .lte('follow_up_at', now.toISOString())
    // Loose server-side bound; selectDueOutreach below is the exact check.
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${now.toISOString()}`)
    .order('follow_up_at')
    .limit(DUE_QUERY_LIMIT);
  if (error) throw error;

  let due = selectDueOutreach((data ?? []) as unknown as OutreachWithContact[], now);

  // Skip users currently in quiet hours. Their rows stay unstamped so the next run picks them up.
  const inQuiet = new Map<string, boolean>();
  for (const userId of new Set(due.map((r) => r.user_id))) {
    try {
      const settings = await fetchUserSettings(supabase, userId);
      inQuiet.set(
        userId,
        !!settings &&
          settings.quiet_hours_enabled &&
          isInQuietHours(
            settings.quiet_hours_schedule,
            settings.quiet_hours_timezone,
            settings.quiet_hours_grace_minutes,
            now,
          ),
      );
    } catch {
      // Same default as dispatchPushoverSummary: if settings cannot be read, send.
      inQuiet.set(userId, false);
    }
  }
  due = due.filter((r) => !inQuiet.get(r.user_id));
  if (due.length === 0) return { nudged: 0 };

  // Claim before sending so overlapping runs or two probes never double-send. Each row is claimed with a
  // conditional update that still requires "never nudged, or nudged before this follow_up_at".
  // Trade-off: if the process dies between claim and send, that nudge is missed.
  const nowIso = now.toISOString();
  const claimed: OutreachWithContact[] = [];
  for (const row of due) {
    const dueIso = new Date(row.follow_up_at as string).toISOString();
    const { data: won, error: claimError } = await supabase
      .from('referral_outreach')
      .update({ last_nudged_at: nowIso })
      .eq('id', row.id)
      .or(`last_nudged_at.is.null,last_nudged_at.lt.${dueIso}`)
      .select('id');
    if (claimError) throw claimError;
    if (won && won.length > 0) claimed.push(row);
  }
  if (claimed.length === 0) return { nudged: 0 };

  const people = claimed.map((row) => ({
    firstName: row.connections?.first_name ?? 'a contact',
    company: row.connections?.company ?? 'their company',
  }));
  const { title, message } = buildNudgeMessage(people);
  try {
    await sendPushover({ appToken: pushover.appToken, userKey: pushover.userKey, title, message });
  } catch (sendError) {
    // Roll back our stamps (only where still ours) so the next run retries.
    for (const row of claimed) {
      const { error: rollbackError } = await supabase
        .from('referral_outreach')
        .update({ last_nudged_at: row.last_nudged_at })
        .eq('id', row.id)
        .eq('last_nudged_at', nowIso);
      if (rollbackError) logger.error(`referral nudge rollback failed for ${row.id}: ${rollbackError.message}`);
    }
    throw sendError;
  }

  logger.info(`referral nudge sent for ${claimed.length} outreach rows`);
  return { nudged: claimed.length };
}
