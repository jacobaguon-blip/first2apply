import type { DbSchema } from '@first2apply/core';
import { runReferralNudge } from '@first2apply/scraper';
import type { ReferralNudgeLogger } from '@first2apply/scraper';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schedule } from 'node-cron';

export function startReferralNudge(opts: {
  supabase: SupabaseClient<DbSchema>;
  logger: ReferralNudgeLogger;
  pushover: { appToken: string; userKey: string };
  cronRule?: string;
}) {
  // Timezone for the cron rule: F2A_REFERRAL_NUDGE_TZ, else the process TZ, else America/Denver (the household's zone).
  const timezone = process.env.F2A_REFERRAL_NUDGE_TZ ?? process.env.TZ ?? 'America/Denver';
  const task = schedule(
    opts.cronRule ?? process.env.F2A_REFERRAL_NUDGE_CRON ?? '0 9 * * *',
    () => {
      runReferralNudge(opts).catch((err) => opts.logger.error(`referral nudge failed: ${(err as Error).message}`));
    },
    { timezone },
  );
  return { stop: () => task.stop() };
}
