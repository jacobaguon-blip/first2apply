/**
 * Server-side adapters that bridge `@first2apply/scraper` to the Node/Electron
 * runtime under Xvfb in Docker. Mirrors apps/desktopProbe/src/server/scraperAdapters.ts
 * but with env-driven settings, console+file logging, and no native UI.
 */
import {
  IAnalyticsClient,
  ILogger,
  ISettingsProvider,
  JobScannerSettings,
} from '@first2apply/scraper';
import fs from 'node:fs';
import path from 'node:path';

import type { ServerProbeEnv } from './env';

/**
 * Settings come from env vars + sensible defaults. user_settings refresh
 * from supabase is intentionally deferred to a follow-up (v0 = env-only).
 */
export class EnvSettingsProvider implements ISettingsProvider<JobScannerSettings> {
  constructor(
    private _logger: ILogger,
    private _env: ServerProbeEnv,
  ) {}

  load(): JobScannerSettings {
    return {
      cronRule: this._env.cronRule,
      preventSleep: false,
      useSound: false,
      areEmailAlertsEnabled: true,
      inAppBrowserEnabled: false,
      pushoverEnabled: true,
      pushoverAppToken: this._env.pushoverAppToken,
      pushoverUserKey: this._env.pushoverUserKey,
    };
  }

  save(_settings: JobScannerSettings): void {
    this._logger.info('[settings] save() ignored — server settings are externally managed via env vars');
  }
}

/**
 * JSON-line stdout logger with optional file mirror.
 */
export class ConsoleLogger implements ILogger {
  private _stream?: fs.WriteStream;

  constructor(opts: { logFile: boolean; logPath?: string } = { logFile: false }) {
    if (opts.logFile) {
      const p = opts.logPath ?? '/opt/first2apply/logs/server-probe.log';
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        this._stream = fs.createWriteStream(p, { flags: 'a' });
      } catch (err) {
        console.warn(`[logger] cannot open log file ${p}: ${(err as Error).message}`);
      }
    }
  }

  private _emit(level: string, msg: string, meta?: Record<string, unknown>) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta ?? {}) });
    if (level === 'error') console.error(line);
    else console.log(line);
    this._stream?.write(line + '\n');
  }

  debug(msg: string, meta?: Record<string, unknown>) { this._emit('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>)  { this._emit('info', msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>)  { this._emit('warn', msg, meta); }
  error(msg: string, meta?: Record<string, unknown>) { this._emit('error', msg, meta); }
}

/**
 * No-op analytics — server has no Amplitude.
 */
export class NoopAnalytics implements IAnalyticsClient {
  trackEvent(name: string, props?: Record<string, unknown>): void {
    console.debug('[analytics]', name, props ?? {});
  }
}
