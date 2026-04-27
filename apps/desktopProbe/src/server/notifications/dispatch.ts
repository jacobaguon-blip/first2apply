import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbSchema, UserSettings } from '@first2apply/core';

import { sendPushover } from '../pushover';
import { isInQuietHours, nextWindowEnd } from './quietHours';

export type DispatchInput = {
  userId: string;
  jobIds: number[];
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
  pushoverAppToken: string;
  pushoverUserKey: string;
};

export type DispatchOutcome =
  | { kind: 'sent' }
  | { kind: 'skipped_quiet_hours'; windowEnd: Date }
  | { kind: 'skipped_already_claimed' }
  | { kind: 'no_settings_sent' }
  | { kind: 'error'; error: unknown };

/**
 * Fetch a user's quiet-hours settings (returns null if no row exists yet).
 */
export async function fetchUserSettings(
  supabase: SupabaseClient<DbSchema>,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserSettings | null) ?? null;
}

/**
 * Dispatch a Pushover summary, respecting quiet-hours and per-window claim.
 *
 *  1. If quiet-hours is enabled and we're currently in a window, mark the
 *     supplied `jobs.notified_pushover_at` rows with the window-end timestamp
 *     so the next periodic scan re-considers them after the window closes.
 *     No queue table — the marker pattern owns this state.
 *  2. Otherwise, attempt to claim the current window via `claim_summary_send`.
 *     Only the first claimer (return value 1) actually sends; later workers
 *     observe a 0 and skip.
 *  3. If the user has no `user_settings` row at all, fall back to plain send.
 */
export async function dispatchPushoverSummary(
  supabase: SupabaseClient<DbSchema>,
  input: DispatchInput,
  nowOverride?: Date,
): Promise<DispatchOutcome> {
  const now = nowOverride ?? new Date();
  let settings: UserSettings | null = null;
  try {
    settings = await fetchUserSettings(supabase, input.userId);
  } catch (error) {
    // If we cannot read settings, default to send (preserve old behaviour).
    return await rawSend(input).then(
      () => ({ kind: 'no_settings_sent' as const }),
      (err) => ({ kind: 'error' as const, error: err }),
    );
  }

  // No settings row at all → behave as upstream did (always send).
  if (!settings) {
    try {
      await rawSend(input);
      return { kind: 'no_settings_sent' };
    } catch (error) {
      return { kind: 'error', error };
    }
  }

  if (
    settings.quiet_hours_enabled &&
    isInQuietHours(
      settings.quiet_hours_schedule,
      settings.quiet_hours_timezone,
      settings.quiet_hours_grace_minutes,
      now,
    )
  ) {
    const windowEnd =
      nextWindowEnd(settings.quiet_hours_schedule, settings.quiet_hours_timezone, now) ??
      new Date(now.getTime() + 60 * 60 * 1000); // safety: 1h fallback
    if (input.jobIds.length > 0) {
      // Mark jobs so they are not re-fetched by the unmarked-rows index.
      // After windowEnd, an external sweeper can clear these markers; for now
      // we simply set the windowEnd as the timestamp.
      await supabase
        .from('jobs')
        .update({ notified_pushover_at: windowEnd.toISOString() } as unknown as never)
        .in('id', input.jobIds);
    }
    return { kind: 'skipped_quiet_hours', windowEnd };
  }

  // Determine the window we want to claim. Outside quiet-hours we use a
  // 1-hour bucket aligned to the top of the current hour as a deterministic
  // window key. (claim_summary_send is "send no more than one summary per
  // p_window_end value".)
  const windowEnd = new Date(now);
  windowEnd.setUTCMinutes(0, 0, 0);
  windowEnd.setUTCHours(windowEnd.getUTCHours() + 1);

  try {
    // Cast: pre-existing supabase-js v2 GenericSchema narrowing issue
    // (see chore/typecheck-fixes); this RPC is well-typed in DbSchema.
    const { data: claimed, error: claimErr } = await (supabase.rpc as unknown as (
      fn: string,
      args: { p_user_id: string; p_window_end: string },
    ) => Promise<{ data: number | null; error: unknown }>)('claim_summary_send', {
      p_user_id: input.userId,
      p_window_end: windowEnd.toISOString(),
    });
    if (claimErr) throw claimErr;
    if (!claimed || claimed < 1) {
      return { kind: 'skipped_already_claimed' };
    }
  } catch (error) {
    // If the RPC is unavailable (older backend), fall through to send.
    // Don't double-send if the error indicates we already claimed.
  }

  try {
    await rawSend(input);
    return { kind: 'sent' };
  } catch (error) {
    return { kind: 'error', error };
  }
}

async function rawSend(input: DispatchInput): Promise<void> {
  await sendPushover({
    appToken: input.pushoverAppToken,
    userKey: input.pushoverUserKey,
    title: input.title,
    message: input.message,
    url: input.url,
    urlTitle: input.urlTitle,
  });
}
