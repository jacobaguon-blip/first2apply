// Drains the `pending_links` table (rows queued from the iOS Share Sheet)
// by opening each URL in the existing HtmlDownloader and routing through
// the normal createLink flow. Self-healing: reaps stuck 'claimed' rows.

import { F2aSupabaseApi } from '@first2apply/ui';
import { getExceptionMessage } from '@first2apply/core';
import { HtmlDownloader } from './htmlDownloader';
import { ILogger } from './logger';

type PendingRow = {
  id: number;
  user_id: string;
  url: string;
  title: string | null;
  status: 'pending' | 'claimed' | 'failed';
  attempts: number;
};

const STUCK_CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const DRAIN_BATCH = 5;

export class PendingLinkDrainer {
  private _draining = false;

  constructor(
    private readonly logger: ILogger,
    private readonly supabaseApi: F2aSupabaseApi,
    private readonly normalHtmlDownloader: HtmlDownloader,
    private readonly notifyAggregated: (failures: number) => void,
  ) {}

  /** Safe to call frequently; concurrent invocations short-circuit. */
  async drain(): Promise<void> {
    if (this._draining) return;
    this._draining = true;
    let terminalFailures = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = this.supabaseApi.getSupabaseClient() as any;
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) return;

      // 0. Reap stuck 'claimed' rows (desktop crashed mid-drain)
      const stuckCutoff = new Date(Date.now() - STUCK_CLAIM_MINUTES * 60 * 1000).toISOString();
      await supabase
        .from('pending_links')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('user_id', user.user.id)
        .eq('status', 'claimed')
        .lt('updated_at', stuckCutoff);

      // 1. Find candidates
      const { data: candidates, error: candErr } = await supabase
        .from('pending_links')
        .select('id, user_id, url, title, status, attempts')
        .eq('user_id', user.user.id)
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(DRAIN_BATCH);
      if (candErr) throw candErr;
      if (!candidates?.length) return;

      for (const cand of candidates as PendingRow[]) {
        // 2. Atomic claim
        const { data: claimed, error: claimErr } = await supabase
          .from('pending_links')
          .update({
            status: 'claimed',
            attempts: cand.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cand.id)
          .eq('status', 'pending')
          .select('*')
          .maybeSingle();
        if (claimErr) {
          this.logger.error(`claim failed for ${cand.id}: ${claimErr.message}`);
          continue;
        }
        if (!claimed) continue; // another client got it

        const row = claimed as PendingRow;
        const isTerminal = row.attempts >= MAX_ATTEMPTS;

        try {
          await this.processOne(row);
          await supabase.from('pending_links').delete().eq('id', row.id);
          this.logger.info(`pending_link ${row.id} drained successfully`);
        } catch (e) {
          const msg = getExceptionMessage(e);
          this.logger.error(`pending_link ${row.id} drain failed (attempt ${row.attempts}): ${msg}`);

          if (isTerminal) {
            terminalFailures += 1;
            await supabase
              .from('pending_links')
              .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
              .eq('id', row.id);
          } else {
            // back to pending; will be retried next drain cycle
            await supabase
              .from('pending_links')
              .update({ status: 'pending', error_message: msg, updated_at: new Date().toISOString() })
              .eq('id', row.id);
          }
        }
      }
    } catch (e) {
      this.logger.error(`drain cycle failed: ${getExceptionMessage(e)}`);
    } finally {
      this._draining = false;
      if (terminalFailures > 0) this.notifyAggregated(terminalFailures);
    }
  }

  private async processOne(row: PendingRow): Promise<void> {
    await this.normalHtmlDownloader.loadUrl({
      url: row.url,
      callback: async ({ html, webPageRuntimeData }) => {
        // derive title from <title> if the share didn't pass one
        let title = row.title?.trim() || '';
        if (!title) {
          const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          title = match?.[1]?.trim().slice(0, 256) || row.url;
        }

        await this.supabaseApi.createLink({
          title,
          url: row.url,
          html,
          webPageRuntimeData,
          force: true,
          scanFrequency: 'daily',
        });
      },
    });
  }
}
