import { IAnalyticsClient } from '@/lib/analytics';
import { getExceptionMessage, throwError } from '@first2apply/core';
import { Job, Link } from '@first2apply/core';
import { F2aSupabaseApi } from '@first2apply/ui';
import { Notification, app, powerSaveBlocker } from 'electron';
import fs from 'fs';
import { ScheduledTask, schedule } from 'node-cron';
import path from 'path';

import { ENV } from '../env';
import { AVAILABLE_CRON_RULES, JobScannerSettings } from '../lib/types';
import { installLinkedInDecorator } from './browserHelpers';
import { chunk, promiseAllSequence, waitRandomBetween } from './helpers';
import { HtmlDownloader } from './htmlDownloader';
import { ILogger } from './logger';
import { dispatchPushoverSummary } from './notifications/dispatch';

const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');

const DEFAULT_SETTINGS: JobScannerSettings = {
  cronRule: AVAILABLE_CRON_RULES[1].value, // every 1h
  preventSleep: true,
  useSound: true,
  areEmailAlertsEnabled: true,
  inAppBrowserEnabled: true,
};

function redactSettings(s: JobScannerSettings): JobScannerSettings {
  const redact = (v?: string) => (v && v.length > 0 ? `<redacted len=${v.length}>` : v);
  return { ...s, pushoverAppToken: redact(s.pushoverAppToken), pushoverUserKey: redact(s.pushoverUserKey) } as JobScannerSettings;
}

/**
 * Class used to manage a cron job that periodically scans links.
 */
export class JobScanner {
  private _logger: ILogger;
  private _supabaseApi: F2aSupabaseApi;
  private _normalHtmlDownloader: HtmlDownloader;
  private _incognitoHtmlDownloader: HtmlDownloader;
  private _onNavigate: (_: { path: string }) => void;
  private _analytics: IAnalyticsClient;

  private _isRunning = true;
  // these defaults will be applied when migrating from older versions
  private _settings: JobScannerSettings = {
    preventSleep: false,
    useSound: false,
    areEmailAlertsEnabled: true,
    inAppBrowserEnabled: true,
  };
  private _cronJob: ScheduledTask | undefined;
  private _prowerSaveBlockerId: number | undefined;
  private _notificationsMap: Map<string, Notification> = new Map();
  private _runningScansCount = 0;

  constructor({
    logger,
    supabaseApi,
    normalHtmlDownloader,
    incognitoHtmlDownloader,
    onNavigate,
    analytics,
  }: {
    logger: ILogger;
    supabaseApi: F2aSupabaseApi;
    normalHtmlDownloader: HtmlDownloader;
    incognitoHtmlDownloader: HtmlDownloader;
    onNavigate: (_: { path: string }) => void;
    analytics: IAnalyticsClient;
  }) {
    this._logger = logger;
    this._supabaseApi = supabaseApi;
    this._normalHtmlDownloader = normalHtmlDownloader;
    this._incognitoHtmlDownloader = incognitoHtmlDownloader;
    this._onNavigate = onNavigate;
    this._analytics = analytics;

    // Install LinkedIn protocol interceptor on the normal scraper session.
    // This must happen after init() so the pool (and its session) exists.

    installLinkedInDecorator(normalHtmlDownloader.getSession());

    // used for testing
    // fs.unlinkSync(settingsPath);

    // load the setings from disk
    let settingsToApply = this._settings;
    if (fs.existsSync(settingsPath)) {
      settingsToApply = {
        ...this._settings,
        ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')),
      };
      this._logger.info(`loaded settings from disk: ${JSON.stringify(redactSettings(settingsToApply))}`);
    } else {
      this._logger.info(`no settings found on disk, using defaults`);
      settingsToApply = DEFAULT_SETTINGS;
    }

    this._applySettings(settingsToApply);
  }

  /**
   * Check if there are any scans running.
   */
  isScanning() {
    return this._runningScansCount > 0;
  }

  /**
   * Whether scanning is currently paused (either via env var or settings).
   */
  isPaused() {
    return ENV.pauseScans || !!this._settings.isPaused;
  }

  /**
   * Scan all links for the current user.
   */
  async scanAllLinks() {
    if (this.isPaused()) {
      this._logger.info(`skipping scheduled scan: scanner is paused${ENV.pauseScans ? ' (F2A_PAUSE_SCANS)' : ''}`);
      this._analytics.trackEvent('scan_skipped_paused', { source: 'scheduled' });
      return;
    }
    // if the scanner hasn't finished scanning the previous links, skip this scan
    if (this.isScanning()) {
      this._logger.info('skipping scheduled scan because the scanner is processing other links');
      return;
    }

    // fetch all links from the database
    const allLinks = (await this._supabaseApi.listLinks()) ?? [];

    // Throttle: daily-frequency links (company target pages) are skipped if
    // they were last scraped less than 24h ago. Manual scanLinks()/scanLink()
    // calls bypass this — the filter only runs on the cron path.
    const nowMs = Date.now();
    const DAILY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const links = allLinks.filter((link) => {
      if (link.scan_frequency !== 'daily') return true;
      const lastMs = link.last_scraped_at ? new Date(link.last_scraped_at).getTime() : 0;
      return nowMs - lastMs >= DAILY_MIN_INTERVAL_MS;
    });
    const skipped = allLinks.length - links.length;
    this._logger.info(`found ${allLinks.length} links (skipping ${skipped} daily links within 24h window)`);

    // start the scan
    return this.scanLinks({ links });
  }

  /**
   * Perform a scan of a list links.
   */
  async scanLinks({ links, sendNotification = true }: { links: Link[]; sendNotification?: boolean }) {
    if (this.isPaused()) {
      this._logger.info(`skipping scan: scanner is paused${ENV.pauseScans ? ' (F2A_PAUSE_SCANS)' : ''}`);
      this._analytics.trackEvent('scan_skipped_paused', { source: 'manual', links_count: links.length });
      return;
    }
    try {
      this._logger.info('scanning links ...');
      this._analytics.trackEvent('scan_links_start', {
        links_count: links.length,
      });
      this._runningScansCount++;
      const start = new Date().getTime();

      await Promise.all(
        links.map(async (link) => {
          const newJobs = await this._normalHtmlDownloader
            .loadUrl({
              url: link.url,
              scrollTimes: 5,
              callback: async ({ html, webPageRuntimeData, maxRetries, retryCount }) => {
                if (!this._isRunning) return []; // stop if the scanner is closed

                const { newJobs, parseFailed, parseErrors } = (await this._supabaseApi.scanHtmls([
                  { linkId: link.id, content: html, webPageRuntimeData, maxRetries, retryCount },
                ])) as { newJobs: Job[]; parseFailed: boolean; parseErrors?: Array<{ linkId: number; message: string }> };

                if (parseErrors?.length) {
                  for (const pe of parseErrors) {
                    this._logger.error(`[edge] parse error for link ${link.title} (${pe.linkId}): ${pe.message}`, {
                      linkId: pe.linkId,
                    });
                  }
                }

                if (parseFailed) {
                  this._logger.debug(`failed to parse html for link ${link.title}`, {
                    linkId: link.id,
                  });

                  throw new Error(`failed to parse html for link ${link.id}`);
                }

                // add a random delay before moving on to the next link
                // to avoid being rate limited by cloudflare
                await waitRandomBetween(1000, 4000);

                return newJobs;
              },
            })
            .catch(async (error): Promise<Job[]> => {
              if (this._isRunning) {
                const errorMessage = getExceptionMessage(error);
                this._logger.error(`failed to scan link: ${errorMessage}`, {
                  linkId: link.id,
                });

                // when dealing with rate limits, bump the number of failed attempts for the link
                await this._supabaseApi
                  .increaseScrapeFailureCount({
                    linkId: link.id,
                    failures: link.scrape_failure_count + 1,
                  })
                  .catch((error) => {
                    this._logger.error(`failed to increase scrape failure count: ${getExceptionMessage(error)}`, {
                      linkId: link.id,
                    });
                  });
              }

              // intetionally return an empty array if there is an error
              // in order to continue scanning the rest of the links
              return [];
            });

          return newJobs;
        }),
      );
      this._logger.info(`downloaded html for ${links.length} links`);

      // scan job descriptions for all pending jobs
      if (!this._isRunning) return;
      const { jobs } = await this._supabaseApi.listJobs({
        status: 'processing',
        limit: 300,
      });
      this._logger.info(`found ${jobs.length} jobs that need processing`);
      const scannedJobs = await this.scanJobs(jobs);
      const newJobs = scannedJobs.filter((job) => job.status === 'new');

      // run post scan hook
      const newJobIds = newJobs.map((job) => job.id);
      await this._supabaseApi
        .runPostScanHook({
          newJobIds: sendNotification ? newJobIds : [], // hacky way to supress email alerts
          areEmailAlertsEnabled: this._settings.areEmailAlertsEnabled,
        })
        .catch((error) => {
          this._logger.error(`failed to run post scan hook: ${getExceptionMessage(error)}`);
        });

      // fire a notification if there are new jobs
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

  /**
   * Scan a list of new jobs to extract the description.
   */
  async scanJobs(jobs: Job[]): Promise<Job[]> {
    this._logger.info(`scanning ${jobs.length} jobs descriptions...`);

    // figure out which jobs can be scanned in incognito mode
    const sites = (await this._supabaseApi.listSites()) as any[];
    const sitesMap = new Map<number, any>(sites.map((site) => [site.id, site]));
    const incognitoJobsToScan = jobs.filter((job) => sitesMap.get(job.siteId)?.incognito_support);
    const normalJobsToScan = jobs.filter((job) => !sitesMap.get(job.siteId)?.incognito_support);

    const scanJobDescriptions = async ({
      jobsToScan,
      htmlDownloader,
    }: {
      jobsToScan: Job[];
      htmlDownloader: HtmlDownloader;
    }) => {
      const jobChunks = chunk(jobsToScan, 10);
      const updatedJobs = await promiseAllSequence(jobChunks, async (chunkOfJobs) => {
        if (!this._isRunning) return chunkOfJobs; // stop if the scanner is closed

        return Promise.all(
          chunkOfJobs.map(async (job) => {
            try {
              return await htmlDownloader.loadUrl({
                url: job.externalUrl,
                scrollTimes: 1,
                callback: async ({ html, maxRetries, retryCount }) => {
                  this._logger.info(`downloaded html for ${job.title}`, {
                    jobId: job.id,
                  });

                  // stop if the scanner is closed
                  if (!this._isRunning) return job;

                  const { job: updatedJob, parseFailed } = await this._supabaseApi.scanJobDescription({
                    jobId: job.id,
                    html,
                    maxRetries,
                    retryCount,
                  });

                  if (parseFailed) {
                    this._logger.debug(`failed to parse job description: ${job.title}`, {
                      jobId: job.id,
                    });

                    throw new Error(`failed to parse job description for ${job.id}`);
                  }

                  // add a random delay before moving on to the next link
                  // to avoid being rate limited by cloudflare
                  await waitRandomBetween(300, 1000);

                  return updatedJob;
                },
              });
            } catch (error) {
              if (this._isRunning)
                this._logger.error(`failed to scan job description: ${getExceptionMessage(error)}`, {
                  jobId: job.id,
                });

              // intetionally return initial job if there is an error
              // in order to continue scanning the rest of the jobs
              return job;
            }
          }),
        );
      }).then((r) => r.flat());

      return updatedJobs;
    };

    const [scannedNormalJobs, scannedIncognitoJobs] = await Promise.all([
      scanJobDescriptions({
        jobsToScan: normalJobsToScan,
        htmlDownloader: this._normalHtmlDownloader,
      }),
      scanJobDescriptions({
        jobsToScan: incognitoJobsToScan,
        htmlDownloader: this._incognitoHtmlDownloader,
      }),
    ]);

    const allScannedJobs = [...scannedIncognitoJobs, ...scannedNormalJobs];
    const updatedJobs = jobs.map((job) => allScannedJobs.find((j) => j.id === job.id) ?? throwError('job not found')); // preserve the order

    this._logger.info('finished scanning job descriptions');

    return updatedJobs;
  }

  /**
   * Display a notfication for new jobs.
   */
  showNewJobsNotification({ newJobs }: { newJobs: Job[] }) {
    if (newJobs.length === 0) return;

    // Create a new notification
    const maxDisplayedJobs = 3;
    const displatedJobs = newJobs.slice(0, maxDisplayedJobs);
    const otherJobsCount = newJobs.length - maxDisplayedJobs;

    const firstJobsLabel = displatedJobs.map((job: Job) => `${job.title} at ${job.companyName}`).join(', ');
    const plural = otherJobsCount > 1 ? 's' : '';
    const otherJobsLabel = otherJobsCount > 0 ? ` and ${otherJobsCount} other${plural}` : '';
    const notification = new Notification({
      title: 'Job Search Update',
      body: `${firstJobsLabel}${otherJobsLabel} ${displatedJobs.length > 1 ? 'are' : 'is'} now available!`,
      // sound: "Submarine",
      silent: !this._settings.useSound,
    });

    // Show the notification
    const notificationId = new Date().getTime().toString();
    this._notificationsMap.set(notificationId, notification);
    notification.on('click', () => {
      this._onNavigate({ path: '/?status=new' });
      this._notificationsMap.delete(notificationId);
      this._analytics.trackEvent('notification_click', {
        jobs_count: newJobs.length,
      });
    });
    // On headless platforms (Pi / Xvfb) the native notifier may throw — don't let it block Pushover.
    try {
      notification.show();
    } catch (err) {
      this._logger.info(`native notification failed (headless?): ${getExceptionMessage(err)}`);
    }
    this._analytics.trackEvent('show_notification', {
      jobs_count: newJobs.length,
    });

    // Fire Pushover via dispatchPushoverSummary so quiet-hours + per-window
    // claim are honored. Env vars win over settings (for headless deploys).
    const appToken = ENV.pushover.appToken || this._settings.pushoverAppToken;
    const userKey = ENV.pushover.userKey || this._settings.pushoverUserKey;
    const pushoverEnabled = !!(ENV.pushover.appToken && ENV.pushover.userKey) || this._settings.pushoverEnabled;
    if (pushoverEnabled && appToken && userKey) {
      const pushoverBody = `${firstJobsLabel}${otherJobsLabel} ${displatedJobs.length > 1 ? 'are' : 'is'} now available!`;
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
            title: 'Job Search Update',
            message: pushoverBody,
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

  /**
   * Update settings.
   */
  updateSettings(settings: JobScannerSettings) {
    this._applySettings(settings);
    this._saveSettings();
  }

  /**
   * Get the current settings.
   */
  getSettings() {
    return { ...this._settings };
  }

  /**
   * Close the scanner.
   */
  close() {
    // end cron job
    if (this._cronJob) {
      this._logger.info(`stopping cron schedule`);
      this._cronJob.stop();
    }

    // stop power blocker
    if (typeof this._prowerSaveBlockerId === 'number') {
      this._logger.info(`stopping prevent sleep`);
      powerSaveBlocker.stop(this._prowerSaveBlockerId);
    }

    this._isRunning = false;
  }

  /**
   * Scan a link to fetch new jobs.
   */
  async scanLink({ linkId }: { linkId: number }) {
    const link = await this._supabaseApi.listLinks().then((links) => links.find((l) => l.id === linkId));
    if (!link) {
      throw new Error(`link not found: ${linkId}`);
    }

    // scan the link after the debug window is closed
    this.scanLinks({ links: [link] }).catch((error) => {
      this._logger.error(getExceptionMessage(error));
    });
  }

  /**
   * Persist settings to disk.
   */
  private _saveSettings() {
    fs.writeFileSync(settingsPath, JSON.stringify(this._settings));
    this._logger.info(`settings saved to disk`);
  }

  /**
   * Apply a new set of settings into the runtime.
   */
  private _applySettings(settings: JobScannerSettings) {
    if (settings.cronRule !== this._settings.cronRule) {
      // stop old cron job
      if (this._cronJob) {
        this._logger.info(`stopping old cron schedule`);
        this._cronJob.stop();
      }
      // start new cron job if needed
      if (settings.cronRule) {
        this._cronJob = schedule(settings.cronRule, () => this.scanAllLinks());
        this._logger.info(`cron job started successfully ${settings.cronRule}`);
      }
    }

    if (settings.preventSleep !== this._settings.preventSleep) {
      // stop old power blocker
      if (typeof this._prowerSaveBlockerId === 'number') {
        this._logger.info(`stopping old prevent sleep`);
        powerSaveBlocker.stop(this._prowerSaveBlockerId);
      }
      // start new power blocker if needed
      if (settings.preventSleep) {
        this._prowerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        this._logger.info(`prevent sleep started successfully: ${this._prowerSaveBlockerId}`);
      }
    }

    this._settings = settings;
    this._logger.info(`settings applied successfully`);
  }
}
