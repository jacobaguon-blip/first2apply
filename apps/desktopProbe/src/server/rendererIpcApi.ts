import { getExceptionMessage } from '@first2apply/core';
import { Job } from '@first2apply/core';
import { F2aSupabaseApi } from '@first2apply/ui';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import fs from 'fs';
import { json2csv } from 'json-2-csv';
import os from 'os';
import path from 'path';

import crypto from 'crypto';

import { IAnalyticsClient } from '../lib/analytics';
import { F2aAutoUpdater } from './autoUpdater';
import { HtmlDownloader } from './htmlDownloader';
import { JobScanner } from '@first2apply/scraper';
import { ENV } from '../env';
import { logger } from './logger';
import { OverlayBrowserView } from './overlayBrowserView';
import { PendingLinkDrainer } from './pendingLinkDrainer';
import { buildShortcutPlist, ShortcutInstallServer } from './shortcutInstaller';
import fsExtra from 'fs';
import pathLib from 'path';
import { getStripeConfig } from './stripeConfig';
import { getSupabaseConfig, setSupabaseConfig, testSupabaseConnection } from './supabaseConfig';
import { validateCompanyTargetUrl } from './targetValidator';
import { makeSingleShotFetcher } from './targetValidator/singleShotFetcher';

const PENDING_DRAIN_INTERVAL_MS = 60_000;
const PENDING_LINKS_UI_HORIZON_DAYS = 14;

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * POST to the Pi probe's control endpoint. Returns true if the Pi accepted
 * the scan, false on any failure (Pi offline, Tailscale down, bad secret,
 * missing config) — caller is responsible for falling back to a local scan.
 */
async function tryProbeScan(path: string): Promise<boolean> {
  const url = ENV.probe.url;
  const secret = ENV.probe.secret;
  if (!url || !secret) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    console.warn(`[probe] scan request to ${path} failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Helper methods used to centralize error handling.
 */
async function _apiCall<T>(method: () => Promise<T>) {
  try {
    const data = await method();
    return { data };
  } catch (error) {
    console.error(getExceptionMessage(error));
    return { error: getExceptionMessage(error, true) };
  }
}

/**
 * IPC handlers that expose methods to the renderer process
 * used to interact with the Supabase instance hosted on the node process.
 */
export function initRendererIpcApi({
  supabaseApi,
  jobScanner,
  autoUpdater,
  overlayBrowserView,
  nodeEnv,
  analytics,
  normalHtmlDownloader,
}: {
  supabaseApi: F2aSupabaseApi;
  jobScanner: JobScanner;
  autoUpdater: F2aAutoUpdater;
  overlayBrowserView: OverlayBrowserView;
  nodeEnv: string;
  analytics: IAnalyticsClient;
  normalHtmlDownloader: HtmlDownloader;
}) {
  // --- iOS share-sheet pending-links drainer ---
  const drainer = new PendingLinkDrainer(
    logger,
    supabaseApi,
    normalHtmlDownloader,
    (failures) => {
      try {
        // Aggregated toast — never per-row
        new Notification({
          title: 'First 2 Apply',
          body: `${failures} shared link(s) failed — see dashboard`,
        }).show();
      } catch (err) {
        logger.error(`pending-link toast failed: ${getExceptionMessage(err)}`);
      }
    },
  );

  setInterval(() => {
    drainer.drain().catch((e) => logger.error(`drain tick error: ${getExceptionMessage(e)}`));
  }, PENDING_DRAIN_INTERVAL_MS);

  // Fire once at startup
  setTimeout(() => drainer.drain().catch((): void => undefined), 10_000);

  // ---- IPC: pending links ----
  ipcMain.handle('list-pending-links', async () =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) return { rows: [] };
      const horizon = new Date(Date.now() - PENDING_LINKS_UI_HORIZON_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('pending_links')
        .select('id, url, title, status, attempts, error_message, created_at, updated_at, completed_at, link_id')
        .eq('user_id', u.user.id)
        .in('status', ['pending', 'failed', 'completed'])
        .gte('created_at', horizon)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return { rows: data ?? [] };
    }),
  );

  ipcMain.handle('retry-pending-link', async (_e, { id }) =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { error } = await supabase
        .from('pending_links')
        .update({ status: 'pending', attempts: 0, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      drainer.drain().catch((): void => undefined);
      return { ok: true };
    }),
  );

  ipcMain.handle('update-pending-link', async (_e, { id, url, title }: { id: number; url: string; title?: string }) =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      let cleanUrl = (url ?? '').trim();
      if (!cleanUrl) throw new Error('URL required');
      if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl.replace(/^\/+/, '');
      try { new URL(cleanUrl); } catch { throw new Error('Invalid URL'); }
      const { error } = await supabase
        .from('pending_links')
        .update({
          url: cleanUrl,
          title: (title ?? '').trim() || null,
          status: 'pending',
          attempts: 0,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
  );

  ipcMain.handle('delete-pending-link', async (_e, { id }) =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { error } = await supabase.from('pending_links').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
  );

  // ---- IPC: personal tokens ----
  ipcMain.handle('list-api-tokens', async () =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) return { tokens: [] };
      const { data, error } = await supabase
        .from('user_api_tokens')
        .select('id, label, scopes, last_used_at, created_at, revoked_at')
        .eq('user_id', u.user.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return { tokens: data ?? [] };
    }),
  );

  ipcMain.handle('create-api-token', async (_e, { label }: { label?: string }) =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error('not-authenticated');
      const raw = crypto.randomBytes(32).toString('base64url');
      const token_hash = sha256Hex(raw);
      const { error } = await supabase.from('user_api_tokens').insert({
        user_id: u.user.id,
        label: (label ?? 'iPhone Share').slice(0, 64),
        token_hash,
        scopes: ['queue-link'],
      });
      if (error) throw new Error(error.message);
      // Raw token returned exactly once; never persisted client-side.
      return { token: raw };
    }),
  );

  // ---- IPC: save .shortcut file to Downloads + reveal in Finder for AirDrop ----
  ipcMain.handle(
    'save-shortcut-file',
    async (_e, { endpoint, token }: { endpoint: string; token: string }) =>
      _apiCall(async () => {
        const file = buildShortcutPlist({ endpoint, token });
        const downloads = app.getPath('downloads');
        const filePath = pathLib.join(downloads, 'First2Apply.shortcut');
        fsExtra.writeFileSync(filePath, file);
        // Open with Shortcuts.app — macOS will show an "Add Shortcut" preview
        // which, once accepted, syncs to iPhone via iCloud within ~30s.
        const openErr = await shell.openPath(filePath);
        if (openErr) logger.error(`openPath failed: ${openErr}`);
        return { path: filePath };
      }),
  );

  // ---- IPC: one-tap install server (Shortcut + QR) ----
  const installServer = new ShortcutInstallServer(logger);
  ipcMain.handle('start-shortcut-install', async (_e, { endpoint, token }: { endpoint: string; token: string }) =>
    _apiCall(async () => installServer.start({ endpoint, token })),
  );
  ipcMain.handle('stop-shortcut-install', async () =>
    _apiCall(async () => {
      installServer.stop();
      return { ok: true };
    }),
  );

  ipcMain.handle('revoke-api-token', async (_e, { id }) =>
    _apiCall(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = supabaseApi.getSupabaseClient() as any;
      const { error } = await supabase
        .from('user_api_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
  );

  ipcMain.handle('get-os-type', () =>
    _apiCall(async () => {
      return os.platform();
    }),
  );

  ipcMain.handle('signup-with-email', async (event, { email, password }) =>
    _apiCall(async () => {
      const result = await supabaseApi.signupWithEmail({ email, password });
      analytics.trackEvent('user_signed_up', { method: 'email', email: email });

      return result;
    }),
  );

  ipcMain.handle('login-with-email', async (event, { email, password }) => {
    const result = await _apiCall(() => supabaseApi.loginWithEmail({ email, password }));
    analytics.trackEvent('user_logged_in', { method: 'email', email: email });
    return result;
  });

  ipcMain.handle('send-password-reset-email', async (event, { email }) =>
    _apiCall(() => supabaseApi.sendPasswordResetEmail({ email })),
  );

  ipcMain.handle('change-password', async (event, { password }) =>
    _apiCall(() => supabaseApi.updatePassword({ password })),
  );

  ipcMain.handle('logout', async () => _apiCall(() => supabaseApi.logout()));

  ipcMain.handle('get-user', async () => _apiCall(() => supabaseApi.getUser()));

  ipcMain.handle(
    'create-link',
    async (_, { title, url, html, webPageRuntimeData, force, scanFrequency, filter_profile_id }) =>
    _apiCall(async () => {
      const { link, newJobs } = await supabaseApi.createLink({
        title,
        url,
        html,
        webPageRuntimeData,
        force,
        scanFrequency,
        filter_profile_id,
      });

      // intentionally not awaited to not have the user wait until JDs are in
      jobScanner.scanJobs(newJobs).catch((error) => {
        console.error(getExceptionMessage(error));
      });

      analytics.trackEvent('link_created', { link_id: link.id, user_id: link.user_id, site_id: link.site_id });

      return { link };
    }),
  );

  ipcMain.handle('validate-company-target-url', async (_e, { url }: { url: string }) => {
    try {
      const result = await validateCompanyTargetUrl({ url, fetcher: makeSingleShotFetcher() });
      return { data: result };
    } catch (err) {
      logger.error(`validator failed for ${url}: ${getExceptionMessage(err)}`);
      return { data: { verdict: 'unrelated' as const, reason: 'validator error: ' + getExceptionMessage(err) } };
    }
  });

  ipcMain.handle('update-link', async (event, { linkId, title, url, filter_profile_id }) => {
    const res = await _apiCall(() => supabaseApi.updateLink({ linkId, title, url, filter_profile_id }));
    analytics.trackEvent('link_updated', { link_id: linkId });
    return res;
  });

  ipcMain.handle('list-links', async () => _apiCall(() => supabaseApi.listLinks()));

  ipcMain.handle('delete-link', async (event, { linkId }) => {
    const res = await _apiCall(() => supabaseApi.deleteLink(linkId));
    analytics.trackEvent('link_deleted', { link_id: linkId });
    return res;
  });

  ipcMain.handle('list-jobs', async (event, { status, search, siteIds, linkIds, labels, limit, after }) =>
    _apiCall(() => supabaseApi.listJobs({ status, search, siteIds, linkIds, labels, limit, after })),
  );

  ipcMain.handle('update-job-status', async (event, { jobId, status }) => {
    const res = await _apiCall(() => supabaseApi.updateJobStatus({ jobId, status }));
    analytics.trackEvent('job_status_updated', { jobId, status });
    return res;
  });

  ipcMain.handle('update-job-labels', async (event, { jobId, labels }) => {
    const res = await _apiCall(() => supabaseApi.updateJobLabels({ jobId, labels }));
    analytics.trackEvent('job_labels_updated', { jobId, labels: labels.join(',') });
    return res;
  });

  ipcMain.handle('list-sites', async () => _apiCall(() => supabaseApi.listSites()));

  ipcMain.handle('update-job-scanner-settings', async (event, { settings }) => {
    const res = await _apiCall(async () => jobScanner.updateSettings(settings));
    analytics.trackEvent('job_scanner_settings_updated', { ...settings });
    return res;
  });

  // handler used to fetch the cron schedule
  ipcMain.handle('get-job-scanner-settings', async () => _apiCall(async () => jobScanner.getSettings()));

  ipcMain.handle('open-external-url', async (event, { url }) => _apiCall(async () => shell.openExternal(url)));

  ipcMain.handle('scan-job-description', async (event, { job }) =>
    _apiCall(async () => {
      const [updatedJob] = await jobScanner.scanJobs([job]);
      return { job: updatedJob };
    }),
  );
  ipcMain.handle('get-app-state', async () =>
    _apiCall(async () => {
      const isScanning = await jobScanner.isScanning();
      const newUpdate = await autoUpdater.getNewUpdate();
      return { isScanning, newUpdate };
    }),
  );
  ipcMain.handle('apply-app-update', async () =>
    _apiCall(async () => {
      await autoUpdater.applyUpdate();
      analytics.trackEvent('app_update_applied');
      return {};
    }),
  );

  ipcMain.handle('create-user-review', async (event, { title, description, rating }) => {
    const res = await _apiCall(() => supabaseApi.createReview({ title, description, rating }));
    analytics.trackEvent('user_review_created', { title, description, rating });
    return res;
  });

  ipcMain.handle('get-user-review', async () => _apiCall(async () => supabaseApi.getUserReview()));

  ipcMain.handle('upsert-master-content', async (event, { kind, content, filename }) =>
    _apiCall(() => supabaseApi.upsertMasterContent({ kind, content, filename })),
  );

  ipcMain.handle('get-master-content', async (event, { kind }) =>
    _apiCall(() => supabaseApi.getMasterContent({ kind })),
  );

  ipcMain.handle('update-user-review', async (event, { id, title, description, rating }) =>
    _apiCall(async () => supabaseApi.updateReview({ id, title, description, rating })),
  );

  ipcMain.handle('get-job-by-id', async (event, { jobId }) =>
    _apiCall(async () => {
      const job = await supabaseApi.getJob(jobId);
      return { job };
    }),
  );

  ipcMain.handle('export-jobs-csv', async (event, { status }) =>
    _apiCall(async () => {
      const res = await dialog.showSaveDialog({
        properties: ['createDirectory'],
        filters: [{ name: 'CSV Jobs', extensions: ['csv'] }],
      });
      const filePath = res.filePath;
      if (res.canceled) return;

      // load all jobs with pagination
      const batchSize = 300;
      let allJobs: Job[] = [];
      let after: string | undefined;
      do {
        const { jobs, nextPageToken } = await supabaseApi.listJobs({
          status,
          limit: batchSize,
          after,
        });
        allJobs = allJobs.concat(jobs);
        after = nextPageToken;
      } while (after);

      // cherry-pick the fields we want to export
      const sanitizedJobs = allJobs.map((job: Job) => ({
        title: job.title,
        company: job.companyName,
        location: job.location,
        salary: job.salary,
        job_type: job.jobType,
        job_status: job.status,
        external_url: job.externalUrl,
      }));

      const csvJobs = json2csv(sanitizedJobs);
      fs.writeFileSync(filePath, csvJobs);
    }),
  );

  ipcMain.handle('change-all-job-status', async (event, { from, to }) =>
    _apiCall(async () => {
      const job = await supabaseApi.changeAllJobStatus({ from, to });
      return { job };
    }),
  );

  ipcMain.handle('get-profile', async () =>
    _apiCall(async () => {
      const profile = await supabaseApi.getProfile();
      return { profile };
    }),
  );

  ipcMain.handle('get-stripe-config', async () =>
    _apiCall(async () => {
      const config = await getStripeConfig(nodeEnv);
      return { config };
    }),
  );

  ipcMain.handle('get-user-settings', async () =>
    _apiCall(async () => {
      const settings = await supabaseApi.getUserSettings();
      return { settings };
    }),
  );

  ipcMain.handle('upsert-user-settings', async (event, { patch }) =>
    _apiCall(async () => {
      const settings = await supabaseApi.upsertUserSettings(patch);
      return { settings };
    }),
  );

  ipcMain.handle('create-note', async (event, { job_id, text, files }) => {
    const res = await _apiCall(() => supabaseApi.createNote({ job_id, text, files }));
    analytics.trackEvent('note_created', { job_id: job_id, note_id: (res as any)?.data?.id });
    return res;
  });

  ipcMain.handle('list-notes', async (event, { job_id }) => _apiCall(() => supabaseApi.listNotes(job_id)));

  ipcMain.handle('update-note', async (event, { noteId, text }) =>
    _apiCall(() => supabaseApi.updateNote({ noteId, text })),
  );

  ipcMain.handle('add-file-to-note', async (event, { noteId, file }) =>
    _apiCall(() => supabaseApi.addFileToNote({ noteId, file })),
  );

  ipcMain.handle('delete-note', async (event, { noteId }) => {
    const res = await _apiCall(() => supabaseApi.deleteNote(noteId));
    analytics.trackEvent('note_deleted', { note_id: noteId });
    return res;
  });

  ipcMain.handle('list-filter-profiles', async () => _apiCall(() => supabaseApi.listFilterProfiles()));

  ipcMain.handle('create-filter-profile', async (event, { input }) => {
    const res = await _apiCall(() => supabaseApi.createFilterProfile(input));
    analytics.trackEvent('filter_profile_created', { name: input?.name });
    return res;
  });

  ipcMain.handle('update-filter-profile', async (event, { id, patch }) => {
    const res = await _apiCall(() => supabaseApi.updateFilterProfile(id, patch));
    analytics.trackEvent('filter_profile_updated', { id });
    return res;
  });

  ipcMain.handle('set-default-filter-profile', async (event, { id }) => {
    const res = await _apiCall(() => supabaseApi.setDefaultFilterProfile(id));
    analytics.trackEvent('filter_profile_set_default', { id });
    return res;
  });

  ipcMain.handle('delete-filter-profile', async (event, { id }) => {
    const res = await _apiCall(() => supabaseApi.deleteFilterProfile(id));
    analytics.trackEvent('filter_profile_deleted', { id });
    return res;
  });

  ipcMain.handle('get-global-blacklist', async () => _apiCall(() => supabaseApi.getGlobalBlacklist()));

  ipcMain.handle('update-global-blacklist', async (event, { companies }) => {
    const res = await _apiCall(() => supabaseApi.updateGlobalBlacklist(companies));
    analytics.trackEvent('global_blacklist_updated', { count: companies.length });
    return res;
  });

  ipcMain.handle('scan-link', async (event, { linkId }) =>
    _apiCall(async () => {
      const ok = await tryProbeScan(`/scan/link/${linkId}`);
      if (!ok) {
        await jobScanner.scanLink({ linkId });
      }
      return { triggeredVia: ok ? 'pi' : 'local' };
    }),
  );

  ipcMain.handle('scan-all-my-links', async () =>
    _apiCall(async () => {
      const { user } = await supabaseApi.getUser();
      if (!user) throw new Error('not logged in');
      const ok = await tryProbeScan(`/scan/user/${user.id}`);
      if (!ok) {
        const links = (await supabaseApi.listLinks()) ?? [];
        await jobScanner.scanLinks({ links });
      }
      return { triggeredVia: ok ? 'pi' : 'local' };
    }),
  );

  ipcMain.handle('open-overlay-browser-view', async (event, { url }) => {
    return _apiCall(async () => overlayBrowserView.open(url));
  });
  ipcMain.handle('close-overlay-browser-view', async () => {
    return _apiCall(async () => overlayBrowserView.close());
  });
  ipcMain.handle('overlay-browser-can-view-go-back', async () => {
    return _apiCall(async () => overlayBrowserView.canGoBack());
  });
  ipcMain.handle('overlay-browser-view-go-back', async () => {
    return _apiCall(async () => overlayBrowserView.goBack());
  });
  ipcMain.handle('overlay-browser-can-view-go-forward', async () => {
    return _apiCall(async () => overlayBrowserView.canGoForward());
  });
  ipcMain.handle('overlay-browser-view-go-forward', async () => {
    return _apiCall(async () => overlayBrowserView.goForward());
  });
  ipcMain.handle('finish-overlay-browser-view', async () => {
    logger.info('[IPC] finish-overlay-browser-view invoked');
    const result = await _apiCall(async () => overlayBrowserView.finish());
    logger.info('[IPC] finish-overlay-browser-view returning', {
      hasData: 'data' in result,
      hasError: 'error' in result,
    });
    return result;
  });
  ipcMain.handle('overlay-browser-view-navigate', async (event, { url }) => {
    return _apiCall(async () => overlayBrowserView.navigate(url));
  });

  ipcMain.handle('get-supabase-config', async () =>
    _apiCall(async () => getSupabaseConfig()),
  );

  ipcMain.handle('test-supabase-connection', async (_event, { url, key }) =>
    _apiCall(async () => {
      await testSupabaseConnection({ url, key });
      return { ok: true };
    }),
  );

  ipcMain.handle('set-supabase-config', async (_event, { url, key }) =>
    _apiCall(async () => {
      await testSupabaseConnection({ url, key });
      setSupabaseConfig({ url, key });
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 150);
      return { ok: true };
    }),
  );

  // ---- Career Ops Tier 1 (feature-flagged in renderer) ----

  ipcMain.handle('career-ops-flag', async () =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) return { enabled: false };
      const { data, error } = await supabase
        .from('profiles')
        .select('career_ops_enabled')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return { enabled: !!(data as { career_ops_enabled?: boolean } | null)?.career_ops_enabled };
    }),
  );

  ipcMain.handle('career-ops-set-flag', async (_e, { enabled }: { enabled: boolean }) =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ career_ops_enabled: enabled } as never)
        .eq('user_id', uid);
      if (error) throw error;
      return { enabled };
    }),
  );

  ipcMain.handle('get-master-cv', async () =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('not authenticated');
      const { data, error } = await supabase
        .from('user_cv_profiles' as never)
        .select('markdown, source_filename, updated_at')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    }),
  );

  ipcMain.handle(
    'save-master-cv',
    async (_e, { markdown, source_filename }: { markdown: string; source_filename?: string | null }) =>
      _apiCall(async () => {
        const supabase = supabaseApi.getSupabaseClient();
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) throw new Error('not authenticated');
        const { data, error } = await supabase
          .from('user_cv_profiles' as never)
          .upsert(
            { user_id: uid, markdown, source_filename: source_filename ?? null, updated_at: new Date().toISOString() } as never,
            { onConflict: 'user_id' },
          )
          .select()
          .single();
        if (error) throw error;
        return data;
      }),
  );

  ipcMain.handle(
    'parse-cv',
    async (
      _e,
      { filename, mimetype, contentBase64 }: { filename: string; mimetype?: string; contentBase64: string },
    ) =>
      _apiCall(async () => {
        const supabase = supabaseApi.getSupabaseClient();
        const { data, error } = await supabase.functions.invoke<{
          markdown?: string;
          source_filename?: string;
          warning?: string;
          error?: { code: string; message: string };
        }>('parse-cv', { body: { filename, mimetype, contentBase64 } });
        if (error) throw error;
        if (data?.error) throw new Error(`${data.error.code}: ${data.error.message}`);
        return data;
      }),
  );

  ipcMain.handle('tailor-cv', async (_e, { jobId }: { jobId: number }) =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data, error } = await supabase.functions.invoke<{
        tailored_cv?: string;
        error?: { code: string; message: string };
      }>('tailor-cv', { body: { job_id: jobId } });
      if (error) throw error;
      if (data?.error) throw new Error(`${data.error.code}: ${data.error.message}`);
      return data;
    }),
  );

  ipcMain.handle('evaluate-job', async (_e, { jobId }: { jobId: number }) =>
    _apiCall(async () => {
      const supabase = supabaseApi.getSupabaseClient();
      const { data, error } = await supabase.functions.invoke<{
        score?: number;
        grade?: 'A' | 'B' | 'C' | 'D' | 'F';
        archetype?: string;
        blocks?: {
          role_summary: string;
          cv_match: string;
          level_strategy: string;
          comp_research: string;
          personalization: string;
          interview_prep: string;
        };
        error?: { code: string; message: string };
      }>('evaluate-job', { body: { job_id: jobId } });
      if (error) throw error;
      if (data?.error) throw new Error(`${data.error.code}: ${data.error.message}`);
      return data;
    }),
  );

  ipcMain.handle(
    'export-cv-pdf',
    async (
      _e,
      { markdown, company, role }: { markdown: string; company: string; role: string },
    ) =>
      _apiCall(async () => {
        const html = renderCvPrintHtml(markdown);
        const win = new BrowserWindow({
          show: false,
          webPreferences: { offscreen: true, javascript: false, nodeIntegration: false, contextIsolation: true },
        });
        try {
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          const pdfBuffer = await win.webContents.printToPDF({
            pageSize: 'Letter',
            printBackground: false,
            margins: { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
          });
          const safe = (s: string) => (s || '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'CV';
          const fileName = `${safe(company)}_${safe(role)}_CV.pdf`;
          const outPath = path.join(app.getPath('downloads'), fileName);
          fs.writeFileSync(outPath, pdfBuffer);
          await shell.openPath(outPath);
          return { path: outPath };
        } finally {
          win.destroy();
        }
      }),
  );
}

/**
 * Minimal markdown → HTML for the ATS-safe print template. Avoids adding a
 * markdown dep to the main process. Handles headings (# ##), bullets, bold,
 * italic, links, and paragraphs — which is what our tailored CVs use.
 */
function renderCvPrintHtml(markdown: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const lines = markdown.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/))) {
      closeList();
      out.push(`<h1>${inline(m[1])}</h1>`);
    } else if ((m = line.match(/^##\s+(.*)$/))) {
      closeList();
      out.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^###\s+(.*)$/))) {
      closeList();
      out.push(`<h3>${inline(m[1])}</h3>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>CV</title>
<style>
  @page { size: Letter; margin: 0.5in 0.6in; }
  body { font-family: Inter, Helvetica, Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; line-height: 1.35; margin: 0; }
  h1 { font-size: 14pt; margin: 0 0 6pt 0; border-bottom: 1px solid #000; padding-bottom: 2pt; text-transform: uppercase; letter-spacing: 0.5pt; }
  h2 { font-size: 12pt; margin: 10pt 0 3pt 0; }
  h3 { font-size: 11pt; margin: 8pt 0 2pt 0; font-weight: 600; }
  p { margin: 2pt 0; }
  ul { margin: 2pt 0 6pt 18pt; padding: 0; }
  li { margin: 1pt 0; }
  a { color: #000; text-decoration: underline; }
</style></head>
<body>${out.join('\n')}</body></html>`;
}
