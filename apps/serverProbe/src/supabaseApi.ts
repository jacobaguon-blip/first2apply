/**
 * Server-side, minimal F2aSupabaseApi-compatible adapter that implements
 * the methods JobScanner needs (IScannerSupabaseApi). Uses the service-role
 * key, so RLS does not apply. Avoids depending on @first2apply/ui (which
 * pulls in React).
 */
import type { IScannerSupabaseApi } from '@first2apply/scraper';
import type { SupabaseClient } from '@supabase/supabase-js';

export class ServerSupabaseApi implements IScannerSupabaseApi {
  constructor(private _supabase: SupabaseClient) {}

  getSupabaseClient() {
    return this._supabase;
  }

  async getUser(): Promise<{ user: { id: string } | null }> {
    const ownerEnv = process.env.F2A_OWNER_USER_ID;
    if (ownerEnv) return { user: { id: ownerEnv } };
    return { user: null };
  }

  async listLinks() {
    const { data, error } = await this._supabase.from('links').select('*').order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []) as never;
  }

  async listSites() {
    const { data, error } = await this._supabase.from('sites').select('*');
    if (error) throw error;
    return data ?? [];
  }

  async listJobs(args: { status: unknown; limit: number }) {
    const { data, error } = await this._supabase.rpc('list_jobs', {
      jobs_status: args.status,
      jobs_after: null,
      jobs_page_size: args.limit,
    });
    if (error) throw error;
    return { jobs: (data ?? []) as never };
  }

  async scanHtmls(htmls: Array<{ linkId: number; content: string; webPageRuntimeData: unknown; maxRetries: number; retryCount: number }>) {
    const { data, error } = await this._supabase.functions.invoke<{
      newJobs: never[];
      parseFailed: boolean;
      parseErrors?: Array<{ linkId: number; message: string }>;
    }>('scan-urls', { body: { htmls } });
    if (error) throw error;
    return data ?? { newJobs: [], parseFailed: false };
  }

  async scanJobDescription(args: { jobId: number; html: string; maxRetries: number; retryCount: number }) {
    const { data, error } = await this._supabase.functions.invoke<{ job: never; parseFailed: boolean }>(
      'scan-job-description',
      { body: args },
    );
    if (error) throw error;
    return data ?? ({ job: null as never, parseFailed: true });
  }

  async runPostScanHook(args: { newJobIds: number[]; areEmailAlertsEnabled: boolean }) {
    const { data, error } = await this._supabase.functions.invoke('post-scan-hook', { body: args });
    if (error) throw error;
    return data;
  }

  async increaseScrapeFailureCount(args: { linkId: number; failures: number }) {
    const { error } = await this._supabase
      .from('links')
      .update({ scrape_failure_count: args.failures })
      .eq('id', args.linkId);
    if (error) throw error;
    return undefined;
  }
}
