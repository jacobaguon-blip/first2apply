import { buildNudgeMessage, selectDueOutreach } from '@first2apply/core';
import type { DbSchema } from '@first2apply/core';
import { fetchUserSettings, isInQuietHours, sendPushover as realSendPushover } from '@first2apply/scraper';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schedule } from 'node-cron';

type Logger = {
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
  logger: Logger;
  pushover: { appToken: string; userKey: string };
  now?: Date;
  sendPushover?: SendPushover;
}): Promise<{ nudged: number }> {
  const { data, error } = await supabase
    .from('referral_outreach')
    .select('id, user_id, status, follow_up_at, last_nudged_at, connections(first_name, company)')
    .eq('status', 'asked')
    .lte('follow_up_at', now.toISOString());
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

  const people = due.map((row) => ({
    firstName: row.connections?.first_name ?? 'a contact',
    company: row.connections?.company ?? 'their company',
  }));
  const { title, message } = buildNudgeMessage(people);
  await sendPushover({ appToken: pushover.appToken, userKey: pushover.userKey, title, message });

  const { error: stampError } = await supabase
    .from('referral_outreach')
    .update({ last_nudged_at: now.toISOString() })
    .in(
      'id',
      due.map((r) => r.id),
    );
  if (stampError) throw stampError;

  logger.info(`referral nudge sent for ${due.length} outreach rows`);
  return { nudged: due.length };
}

export function startReferralNudge(opts: {
  supabase: SupabaseClient<DbSchema>;
  logger: Logger;
  pushover: { appToken: string; userKey: string };
  cronRule?: string;
}) {
  const task = schedule(opts.cronRule ?? process.env.F2A_REFERRAL_NUDGE_CRON ?? '0 9 * * *', () => {
    runReferralNudge(opts).catch((err) => opts.logger.error(`referral nudge failed: ${(err as Error).message}`));
  });
  return { stop: () => task.stop() };
}
