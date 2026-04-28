/**
 * Public interfaces the scraper library expects each consuming app to
 * provide. The library does not import from `electron`; runtime concerns
 * (windows, native notifications, file persistence) are injected.
 */
import type { Job, Link } from '@first2apply/core';

/**
 * Logger contract — every app provides its own implementation.
 * Matches the existing apps/desktopProbe ILogger surface.
 */
export interface ILogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  warn?(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Analytics contract. No-op implementations are valid (server probe).
 */
export interface IAnalyticsClient {
  trackEvent(name: string, props?: Record<string, unknown>): void;
}

/**
 * Persistence layer for scanner settings. Desktop reads/writes a JSON file
 * under Electron userData; server reads from env + supabase user_settings.
 */
export interface ISettingsProvider<T> {
  load(): T | undefined;
  save(settings: T): void;
}

/**
 * Native notification adapter. Desktop wraps Electron's Notification class;
 * server returns no-op (no display).
 */
export interface INativeNotifier {
  showNewJobs(opts: {
    title: string;
    body: string;
    silent?: boolean;
    onClick?: () => void;
  }): void;
}

/**
 * Sleep-prevention adapter. Desktop wraps Electron's powerSaveBlocker;
 * server returns no-op (the Pi is plugged in and never sleeps).
 */
export interface ISleepPreventer {
  prevent(): void;
  release(): void;
}

/**
 * HTML-download contract. Both apps provide concrete implementations:
 * desktop wraps Electron BrowserWindow; server (PR 3) provides its own
 * implementation, likely also Electron+Xvfb.
 */
export interface IHtmlDownloader {
  init(): void;
  close(): Promise<void>;
  getSession(): unknown; // typed as `Session` in electron-coupled callers
  loadUrl<T>(args: {
    url: string;
    scrollTimes?: number;
    callback: (cb: {
      html: string;
      webPageRuntimeData: unknown;
      maxRetries: number;
      retryCount: number;
    }) => Promise<T>;
  }): Promise<T>;
}

/**
 * Re-export selected types from core that consumers may need at the boundary.
 */
export type { Job, Link };
