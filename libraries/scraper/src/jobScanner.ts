import { getExceptionMessage, throwError } from '@first2apply/core';
import { Job, Link } from '@first2apply/core';
import { ScheduledTask, schedule } from 'node-cron';

import { chunk, promiseAllSequence, waitRandomBetween } from './helpers';
import { dispatchPushoverSummary } from './notifications/dispatch';
import {
  DEFAULT_JOB_SCANNER_SETTINGS,
  JobScannerSettings,
} from './scannerSettings';
import {
  IAnalyticsClient,
  IHtmlDownloader,
  ILogger,
  INativeNotifier,
  ISettingsProvider,
  ISleepPreventer,
} from './types';

/**
 * Minimal supabase-API surface the scanner uses. The desktop app supplies
 * `F2aSupabaseApi` from `@first2apply/ui`; the server probe (PR 3) supplies
 * its own implementation.
 */
/**
 * Surface the scanner uses on the supabase API. Each method is narrowed to
 * just the fields we read; both `F2aSupabaseApi` (desktop) and `apps/serverProbe`'s
 * own impl are structurally compatible.
 */
export interface IScannerSupabaseApi {
  listLinks(): Promise<Link[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listJobs(args: { status: any; limit: number }): Promise<{ jobs: Job[] } & Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listSites(): Promise<any[]>;
  scanHtmls(htmls: Array<{ linkId: number; content: string; webPageRuntimeData: unknown; maxRetries: number; retryCount: number }>): Promise<{
    newJobs: Job[];
    parseFailed: boolean;
    parseErrors?: Array<{ linkId: number; message: string }>;
  } & Record<string, unknown>>;
  scanJobDescription(args: { jobId: number; html: string; maxRetries: number; retryCount: number }): Promise<{ job: Job; parseFailed: boolean } & Record<string, unknown>>;
  runPostScanHook(args: { newJobIds: number[]; areEmailAlertsEnabled: boolean }): Promise<unknown>;
  increaseScrapeFailureCount(args: { linkId: number; failures: number }): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUser(): Promise<{ user: { id: string } | null } | { user: any }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSupabaseClient(): any;
}

function redactSettings(s: JobScannerSettings): JobScannerSettings {
  const redact = (v?: string) => (v && v.length > 0 ? `<redacted len=${v.length}>` : v);
  return { ...s, pushoverAppToken: redact(s.pushoverAppToken), pushoverUserKey: redact(s.pushoverUserKey) } as JobScannerSettings;
}

export interface JobScannerCtorArgs {
  logger: ILogger;
  supabaseApi: IScannerSupabaseApi;
  normalHtmlDownloader: IHtmlDownloader;
  incognitoHtmlDownloader: IHtmlDownloader;
  onNavigate: (_: { path: string }) => void;
  analytics: IAnalyticsClient;
  /** Callback to install protocol/session decorators on the normal downloader's session. Optional — server probe may pass a no-op. */
  sessionDecorator?: (session: unknown) => void;
  /** Native UI notifier (desktop only). Server probe omits. */
  nativeNotifier?: INativeNotifier;
  /** Sleep prevention (desktop only). Server probe omits. */
  sleepPreventer?: ISleepPreventer;
  /** Settings persistence. Desktop writes to disk, server reads from env+supabase. */
  settingsProvider: ISettingsProvider<JobScannerSettings>;
  /** External pause flag (e.g. F2A_PAUSE_SCANS env var). Defaults to false. */
  isExternallyPaused?: () => boolean;
  /** Pushover env-var overrides (precedence over settings). Optional. */
  pushoverEnv?: { appToken?: string; userKey?: string };
}

/**
 * Cron-driven link scanner. Cross-platform — desktop and server probe both
 * use this; runtime concerns (notifications, settings persistence, sleep)
 * are injected.
 */
export class JobScanner {
  private _logger: ILogger;
  private _supabaseApi: IScannerSupabaseApi;
  private _normalHtmlDownloader: IHtmlDownloader;
  private _incognitoHtmlDownloader: IHtmlDownloader;
  private _onNavigate: (_: { path: string }) => void;
  private _analytics: IAnalyticsClient;
  private _nativeNotifier?: INativeNotifier;
  private _sleepPreventer?: ISleepPreventer;
  private _settingsProvider: ISettingsProvider<JobScannerSettings>;
  private _isExternallyPaused: () => boolean;
  private _pushoverEnv: { appToken?: string; userKey?: string };

  private _isRunning = true;
  private _settings: JobScannerSettings = {
    preventSleep: false,
    useSound: false,
    areEmailAlertsEnabled: true,
    inAppBrowserEnabled: true,
  };
  private _cronJob: ScheduledTask | undefined;
  private _runningScansCount = 0;

  constructor(args: JobScannerCtorArgs) {
    this._logger = args.logger;
    this._supabaseApi = args.supabaseApi;
    this._normalHtmlDownloader = args.normalHtmlDownloader;
    this._incognitoHtmlDownloader = args.incognitoHtmlDownloader;
    this._onNavigate = args.onNavigate;
    this._analytics = args.analytics;
    this._nativeNotifier = args.nativeNotifier;
    this._sleepPreventer = args.sleepPreventer;
    this._settingsProvider = args.settingsProvider;
    this._isExternallyPaused = args.isExternallyPaused ?? (() => false);
    this._pushoverEnv = args.pushoverEnv ?? {};

    // Install session decorators (e.g. LinkedIn protocol interceptor) on the
    // normal scraper session. Caller supplies the decorator; lib stays
    // electron-free.
    if (args.sessionDecorator) {
      args.sessionDecorator(args.normalHtmlDownloader.getSession());
    }

    const loaded = this._settingsProvider.load();
    const settingsToApply: JobScannerSettings = loaded
      ? { ...this._settings, ...loaded }
      : DEFAULT_JOB_SCANNER_SETTINGS;
    this._logger.info(
      loaded
        ? `loaded settings: ${JSON.stringify(redactSettings(settingsToApply))}`
        : 'no persisted settings, using defaults',
    );

    this._applySettings(settingsToApply);
  }

  isScanning(): boolean {
    return this._runningScansCount > 0;
  }

  isPaused(): boolean {
    return this._isExternallyPaused() || !!this._settings.isPaused;
  }

  async scanAllLinks(): Promise<unknown> {
    if (this.isPaused()) {
      this._logger.info(`skipping scheduled scan: scanner is paused`);
      this._analytics.trackEvent('scan_skipped_paused', { source: 'scheduled' });
      return;
    }
    if (this.isScanning()) {
      this._logger.info('skipping scheduled scan because the scanner is processing other links');
      return;
    }

    const allLinks = (await this._supabaseApi.listLinks()) ?? [];

    const nowMs = Date.now();
    const DAILY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const links = allLinks.filter((link) => {
      if (link.scan_frequency !== 'daily') return true;
      const lastMs = link.last_scraped_at ? new Date(link.last_scraped_at).getTime() : 0;
      return nowMs - lastMs >= DAILY_MIN_INTERVAL_MS;
    });
    const skipped = allLinks.length - links.length;
    this._logger.info(`found ${allLinks.length} links (skipping ${skipped} daily links within 24h window)`);

    return this.scanLinks({ links });
  }

  async scanLinks({ links, sendNotification = true }: { links: Link[]; sendNotification?: boolean }): Promise<void> {
    if (this.isPaused()) {
      this._logger.info(`skipping scan: scanner is paused`);
      this._analytics.trackEvent('scan_skipped_paused', { source: 'manual', links_count: links.length });
      return;
    }
    try {
      this._logger.info('scanning links ...');
      this._analytics.trackEvent('scan_links_start', { links_count: links.length });
      this._runningScansCount++;
      const start = new Date().getTime();

      await Promise.all(
        links.map(async (link) => {
          const newJobs = await this._normalHtmlDownloader
            .loadUrl<Job[]>({
              url: link.url,
              scrollTimes: 5,
              callback: async ({ html, webPageRuntimeData, maxRetries, retryCount }) => {
                if (!this._isRunning) return [];

                const { newJobs, parseFailed, parseErrors } = await this._supabaseApi.scanHtmls([
                  { linkId: link.id, content: html, webPageRuntimeData, maxRetries, retryCount },
                ]);

                if (parseErrors?.length) {
                  for (const pe of parseErrors) {
                    this._logger.error(`[edge] parse error for link ${link.title} (${pe.linkId}): ${pe.message}`, {
                      linkId: pe.linkId,
                    });
                  }
                }

                if (parseFailed) {
                  this._logger.debug(`failed to parse html for link ${link.title}`, { linkId: link.id });
                  throw new Error(`failed to parse html for link ${link.id}`);
                }

                await waitRandomBetween(1000, 4000);
                return newJobs;
              },
            })
            .catch(async (error): Promise<Job[]> => {
              if (this._isRunning) {
                const errorMessage = getExceptionMessage(error);
                this._logger.error(`failed to scan link: ${errorMessage}`, { linkId: link.id });

                await this._supabaseApi
                  .increaseScrapeFailureCount({
                    linkId: link.id,
                    failures: link.scrape_failure_count + 1,
                  })
                  .catch((err) => {
                    this._logger.error(`failed to increase scrape failure count: ${getExceptionMessage(err)}`, {
                      linkId: link.id,
                    });
                  });
              }
              return [];
            });

          return newJobs;
        }),
      );
      this._logger.info(`downloaded html for ${links.length} links`);

      if (!this._isRunning) return;
      const { jobs } = await this._supabaseApi.listJobs({ status: 'processing', limit: 300 });
      this._logger.info(`found ${jobs.length} jobs that need processing`);
      const scannedJobs = await this.scanJobs(jobs);
      const newJobs = scannedJobs.filter((job) => job.status === 'new');

      const newJobIds = newJobs.map((job) => job.id);
      await this._supabaseApi
        .runPostScanHook({
          newJobIds: sendNotification ? newJobIds : [],
          areEmailAlertsEnabled: this._settings.areEmailAlertsEnabled,
        })
        .catch((error) => {
          this._logger.error(`failed to run post scan hook: ${getExceptionMessage(error)}`);
        });

      if (!this._isRunning) return;
      if (sendNotification) this.showNewJobsNotification({ newJobs });

      const end = new Date().getTime();
      const took = (end - start) / 1000;
      this._logger.info(`scan complete in ${took.toFixed(0)} seconds`);
      this._analytics.trackEvent('scan_links_complete', {
        links_count: links.length,
        new_jobs_count: newJobs.length,
      });
    } catch (error) {
      this._logger.error(getExceptionMessage(error));
    } finally {
      this._runningScansCount--;
    }
  }

  async scanJobs(jobs: Job[]): Promise<Job[]> {
    this._logger.info(`scanning ${jobs.length} jobs descriptions...`);

    const sites = await this._supabaseApi.listSites();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sitesMap = new Map<number, any>(sites.map((site: any) => [site.id, site]));
    const incognitoJobsToScan = jobs.filter((job) => sitesMap.get(job.siteId)?.incognito_support);
    const normalJobsToScan = jobs.filter((job) => !sitesMap.get(job.siteId)?.incognito_support);

    const scanJobDescriptions = async ({
      jobsToScan,
      htmlDownloader,
    }: {
      jobsToScan: Job[];
      htmlDownloader: IHtmlDownloader;
    }) => {
      const jobChunks = chunk(jobsToScan, 10);
      const updatedJobs = await promiseAllSequence(jobChunks, async (chunkOfJobs) => {
        if (!this._isRunning) return chunkOfJobs;

        return Promise.all(
          chunkOfJobs.map(async (job) => {
            try {
              return await htmlDownloader.loadUrl<Job>({
                url: job.externalUrl,
                scrollTimes: 1,
                callback: async ({ html, maxRetries, retryCount }) => {
                  this._logger.info(`downloaded html for ${job.title}`, { jobId: job.id });
                  if (!this._isRunning) return job;

                  const { job: updatedJob, parseFailed } = await this._supabaseApi.scanJobDescription({
                    jobId: job.id,
                    html,
                    maxRetries,
                    retryCount,
                  });

                  if (parseFailed) {
                    this._logger.debug(`failed to parse job description: ${job.title}`, { jobId: job.id });
                    throw new Error(`failed to parse job description for ${job.id}`);
                  }

                  await waitRandomBetween(300, 1000);
                  return updatedJob;
                },
              });
            } catch (error) {
              if (this._isRunning)
                this._logger.error(`failed to scan job description: ${getExceptionMessage(error)}`, {
                  jobId: job.id,
                });
              return job;
            }
          }),
        );
      }).then((r) => r.flat());

      return updatedJobs;
    };

    const [scannedNormalJobs, scannedIncognitoJobs] = await Promise.all([
      scanJobDescriptions({ jobsToScan: normalJobsToScan, htmlDownloader: this._normalHtmlDownloader }),
      scanJobDescriptions({ jobsToScan: incognitoJobsToScan, htmlDownloader: this._incognitoHtmlDownloader }),
    ]);

    const allScannedJobs = [...scannedIncognitoJobs, ...scannedNormalJobs];
    const updatedJobs = jobs.map((job) => allScannedJobs.find((j) => j.id === job.id) ?? throwError('job not found'));
    this._logger.info('finished scanning job descriptions');
    return updatedJobs;
  }

  showNewJobsNotification({ newJobs }: { newJobs: Job[] }): void {
    if (newJobs.length === 0) return;

    const maxDisplayedJobs = 3;
    const displatedJobs = newJobs.slice(0, maxDisplayedJobs);
    const otherJobsCount = newJobs.length - maxDisplayedJobs;

    const firstJobsLabel = displatedJobs.map((job: Job) => `${job.title} at ${job.companyName}`).join(', ');
    const plural = otherJobsCount > 1 ? 's' : '';
    const otherJobsLabel = otherJobsCount > 0 ? ` and ${otherJobsCount} other${plural}` : '';
    const title = 'Job Search Update';
    const body = `${firstJobsLabel}${otherJobsLabel} ${displatedJobs.length > 1 ? 'are' : 'is'} now available!`;

    // Native UI notification (desktop only)
    if (this._nativeNotifier) {
      try {
        this._nativeNotifier.showNewJobs({
          title,
          body,
          silent: !this._settings.useSound,
          onClick: () => {
            this._onNavigate({ path: '/?status=new' });
            this._analytics.trackEvent('notification_click', { jobs_count: newJobs.length });
          },
        });
      } catch (err) {
        this._logger.info(`native notification failed: ${getExceptionMessage(err)}`);
      }
      this._analytics.trackEvent('show_notification', { jobs_count: newJobs.length });
    }

    // Pushover (cross-platform). Env vars win over settings (per existing behavior).
    const appToken = this._pushoverEnv.appToken || this._settings.pushoverAppToken;
    const userKey = this._pushoverEnv.userKey || this._settings.pushoverUserKey;
    const pushoverEnabled =
      !!(this._pushoverEnv.appToken && this._pushoverEnv.userKey) || this._settings.pushoverEnabled;
    if (pushoverEnabled && appToken && userKey) {
      this._supabaseApi
        .getUser()
        .then(({ user }) => {
          if (!user) {
            this._logger.info('pushover dispatch skipped: no authenticated user');
            return;
          }
          return dispatchPushoverSummary(this._supabaseApi.getSupabaseClient(), {
            userId: user.id,
            jobIds: newJobs.map((j) => j.id),
            title,
            message: body,
            pushoverAppToken: appToken,
            pushoverUserKey: userKey,
          }).then((outcome) => {
            this._logger.info(`pushover dispatch outcome: ${outcome.kind}`);
            if (outcome.kind === 'error') {
              this._logger.error(`pushover send failed: ${getExceptionMessage(outcome.error)}`);
            }
          });
        })
        .catch((err) => this._logger.error(`pushover dispatch failed: ${getExceptionMessage(err)}`));
    }
  }

  updateSettings(settings: JobScannerSettings): void {
    this._applySettings(settings);
    this._settingsProvider.save(this._settings);
    this._logger.info('settings persisted via provider');
  }

  getSettings(): JobScannerSettings {
    return { ...this._settings };
  }

  close(): void {
    if (this._cronJob) {
      this._logger.info(`stopping cron schedule`);
      this._cronJob.stop();
    }
    if (this._sleepPreventer) {
      this._logger.info(`stopping prevent sleep`);
      this._sleepPreventer.release();
    }
    this._isRunning = false;
  }

  async scanLink({ linkId }: { linkId: number }): Promise<void> {
    const link = await this._supabaseApi.listLinks().then((links) => links.find((l) => l.id === linkId));
    if (!link) {
      throw new Error(`link not found: ${linkId}`);
    }
    this.scanLinks({ links: [link] }).catch((error) => {
      this._logger.error(getExceptionMessage(error));
    });
  }

  private _applySettings(settings: JobScannerSettings): void {
    if (settings.cronRule !== this._settings.cronRule) {
      if (this._cronJob) {
        this._logger.info(`stopping old cron schedule`);
        this._cronJob.stop();
      }
      if (settings.cronRule) {
        this._cronJob = schedule(settings.cronRule, () => this.scanAllLinks());
        this._logger.info(`cron job started successfully ${settings.cronRule}`);
      }
    }

    if (settings.preventSleep !== this._settings.preventSleep && this._sleepPreventer) {
      if (this._settings.preventSleep) {
        this._logger.info(`releasing previous sleep preventer`);
        this._sleepPreventer.release();
      }
      if (settings.preventSleep) {
        this._sleepPreventer.prevent();
        this._logger.info(`prevent sleep activated`);
      }
    }

    this._settings = settings;
    this._logger.info(`settings applied successfully`);
  }
}
