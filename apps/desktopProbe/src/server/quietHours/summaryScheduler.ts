import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { QuietHoursSettings } from '../../lib/types';
import { mostRecentWindowEnd, windowEndFor } from './predicate';
import { aggregateBySource, formatSummaryBody, formatSummaryTitle } from './aggregate';

type Deps = {
  supabase: SupabaseClient;
  userId: string;
  deviceId: string;
  sendPushover: (title: string, body: string) => Promise<void>;
};

export class PushoverSummaryScheduler {
  constructor(private deps: Deps) {}

  async tick({ now, settings }: { now: Date; settings: QuietHoursSettings }): Promise<void> {
    if (!settings.enabled) return;
    if (settings.pushoverOwnerDeviceId !== this.deps.deviceId) return;

    const endCurrent = windowEndFor(now, settings.schedule, settings.timezone);
    const windowEnd = endCurrent ?? mostRecentWindowEnd(now, settings.schedule, settings.timezone);
    if (!windowEnd || windowEnd > now) return;

    const windowStart = this.inferWindowStart(windowEnd, settings);

    const { data: claimed, error: claimErr } = await this.deps.supabase
      .rpc('claim_summary_send', { p_user_id: this.deps.userId, p_window_end: windowEnd.toISOString() });
    if (claimErr || !claimed) return;

    const { data: jobs } = await this.deps.supabase
      .from('jobs')
      .select('siteName, searchTitle, id')
      .eq('user_id', this.deps.userId)
      .is('notified_pushover_at', null)
      .gte('created_at', windowStart.toISOString())
      .lt('created_at', windowEnd.toISOString());
    const rows = (jobs as any[] | null) ?? [];
    if (rows.length === 0) return;

    const groups = aggregateBySource(rows);
    await this.deps.sendPushover(formatSummaryTitle(rows.length), formatSummaryBody(groups));

    await this.deps.supabase
      .from('jobs')
      .update({ notified_pushover_at: new Date().toISOString() })
      .eq('user_id', this.deps.userId)
      .is('notified_pushover_at', null)
      .in('id', rows.map((r: any) => r.id));
  }

  private inferWindowStart(end: Date, s: QuietHoursSettings): Date {
    const endDt = DateTime.fromJSDate(end).setZone(s.timezone);
    for (let offset = 0; offset < 8; offset++) {
      const base = endDt.minus({ days: offset }).startOf('day');
      const key = ['mon','tue','wed','thu','fri','sat','sun'][(base.weekday - 1)] as keyof typeof s.schedule;
      const cfg = s.schedule[key];
      if (!cfg?.enabled) continue;
      const [sh, sm] = cfg.start.split(':').map(Number);
      const [eh, em] = cfg.end.split(':').map(Number);
      const start = base.set({ hour: sh, minute: sm });
      let computedEnd = base.set({ hour: eh, minute: em });
      if (computedEnd <= start) computedEnd = computedEnd.plus({ days: 1 });
      if (Math.abs(computedEnd.toMillis() - end.getTime()) < 1000) return start.toJSDate();
    }
    return new Date(end.getTime() - 24 * 3600 * 1000);
  }
}
