/**
 * Server-side HtmlDownloader. Same hidden-window semantics as the desktop
 * impl (apps/desktopProbe/src/server/htmlDownloader.ts) but lives here so
 * serverProbe doesn't take a runtime dep on desktop's source tree. Runs
 * under Xvfb in Docker.
 */
import { RateLimitError, WebPageRuntimeData } from '@first2apply/core';
import { ILogger, IHtmlDownloader, sleep, waitRandomBetween } from '@first2apply/scraper';
import { BrowserWindow, Session } from 'electron';
import { backOff } from 'exponential-backoff';

import { consumeRuntimeData } from './browserHelpers';
import { WorkerQueue } from './workerQueue';

const KNOWN_AUTHWALLS = ['authwall', 'login'];

export class HiddenWindowDownloader implements IHtmlDownloader {
  private _isRunning = false;
  private _pool: BrowserWindowPool | undefined;
  private _logger: ILogger;
  private _numInstances: number;
  private _incognitoMode: boolean;

  constructor({ logger, numInstances, incognitoMode }: { logger: ILogger; numInstances: number; incognitoMode: boolean }) {
    this._logger = logger;
    this._numInstances = numInstances;
    this._incognitoMode = incognitoMode;
  }

  init() {
    this._pool = new BrowserWindowPool(this._numInstances, this._incognitoMode);
    this._isRunning = true;
  }

  getSession(): Session {
    if (!this._pool) throw new Error('HiddenWindowDownloader not initialized');
    return this._pool.getSession();
  }

  async loadUrl<T>({
    url,
    scrollTimes = 3,
    callback,
  }: {
    url: string;
    scrollTimes?: number;
    callback: (_: { html: string; webPageRuntimeData: WebPageRuntimeData; maxRetries: number; retryCount: number }) => Promise<T>;
  }): Promise<T> {
    if (!this._pool) throw new Error('Pool not initialized');

    return this._pool.useBrowserWindow(async (window) => {
      await this._loadUrl(window, url, scrollTimes);

      const maxRetries = 1;
      let retryCount = 0;
      return backOff(
        async () => {
          const html: string = await window.webContents.executeJavaScript('document.documentElement.innerHTML');
          const webPageRuntimeData: WebPageRuntimeData = consumeRuntimeData(url);
          return callback({ html, webPageRuntimeData, maxRetries, retryCount: retryCount++ });
        },
        {
          jitter: 'full',
          numOfAttempts: 1 + maxRetries,
          maxDelay: 5_000,
          startingDelay: 1_000,
          retry: () => this._isRunning,
        },
      );
    });
  }

  async close() {
    this._isRunning = false;
    return this._pool?.close();
  }

  private async _loadUrl(window: BrowserWindow, url: string, scrollTimes: number) {
    if (!this._isRunning) return '<html></html>';
    this._logger.info(`loading url: ${url} ...`);
    await backOff(
      async () => {
        let statusCode: number | undefined;
        window.webContents.once('did-navigate', (_e, _u, httpResponseCode) => {
          statusCode = httpResponseCode;
        });
        await window.loadURL(url);

        const title = await window.webContents.executeJavaScript('document.title');
        if (statusCode === 429 || title?.toLowerCase().startsWith('just a moment')) {
          this._logger.debug(`429 status code detected: ${url}`);
          await waitRandomBetween(20_000, 40_000);
          throw new RateLimitError('rate limit exceeded');
        }

        for (let i = 0; i < scrollTimes; i++) {
          await window.webContents.executeJavaScript(`
            Array.from(document.querySelectorAll('*'))
              .filter(el => el.scrollHeight > el.clientHeight)
              .forEach(el => { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); });
          `);
          await sleep(2_000);

          const finalUrl = window.webContents.getURL();
          if (KNOWN_AUTHWALLS.some((aw) => finalUrl?.includes(aw))) {
            this._logger.debug(`authwall detected: ${finalUrl}`);
            throw new Error('authwall');
          }
        }
      },
      {
        jitter: 'full',
        numOfAttempts: 20,
        maxDelay: 5_000,
        retry: (error) => !(error instanceof RateLimitError) && this._isRunning,
      },
    );
    this._logger.info(`finished loading url: ${url}`);
  }
}

class BrowserWindowPool {
  private _pool: Array<{ id: number; window: BrowserWindow; isAvailable: boolean }> = [];
  private _queue: WorkerQueue;

  constructor(instances: number, incognitoMode: boolean) {
    const partition = incognitoMode ? `incognito` : `persist:scraper`;
    for (let i = 0; i < instances; i++) {
      const window = new BrowserWindow({
        show: false,
        width: 1600,
        height: 1200,
        webPreferences: { webSecurity: true, partition },
      });
      window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        if (details.url.includes('checkpoint/pk/initiateLogin')) {
          // block
        } else {
          callback({});
        }
      });
      this._pool.push({ id: i, window, isAvailable: true });
    }
    this._queue = new WorkerQueue(instances);
  }

  getSession(): Session {
    return this._pool[0].window.webContents.session;
  }

  async useBrowserWindow<T>(fn: (window: BrowserWindow) => Promise<T>) {
    return this._queue.enqueue(() => {
      const worker = this._pool.find((w) => w.isAvailable);
      if (!worker) throw new Error('No available window found');
      worker.isAvailable = false;
      return fn(worker.window).finally(() => {
        worker.isAvailable = true;
      });
    });
  }

  close() {
    return new Promise<void>((resolve) => {
      this._queue.on('empty', () => {
        this._pool.forEach((w) => w.window.close());
        setTimeout(() => resolve(), 500);
      });
      this._queue.next();
    });
  }
}
