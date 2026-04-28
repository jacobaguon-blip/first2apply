/**
 * Adapters that bridge `@first2apply/scraper`'s injection points to the
 * Electron desktop runtime. The scraper library is electron-free; this
 * file contains all the electron-coupled implementations.
 */
import {
  INativeNotifier,
  ISettingsProvider,
  ISleepPreventer,
  JobScannerSettings,
} from '@first2apply/scraper';
import { Notification, app, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';

import { getExceptionMessage } from '@first2apply/core';

import type { ILogger } from './logger';

const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');

/**
 * Reads/writes JobScannerSettings to disk under Electron userData.
 */
export class FileSettingsProvider implements ISettingsProvider<JobScannerSettings> {
  constructor(private _logger: ILogger) {}

  load(): JobScannerSettings | undefined {
    if (!fs.existsSync(settingsPath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as JobScannerSettings;
    } catch (err) {
      this._logger.error(`failed to read settings: ${getExceptionMessage(err)}`);
      return undefined;
    }
  }

  save(settings: JobScannerSettings): void {
    fs.writeFileSync(settingsPath, JSON.stringify(settings));
  }
}

/**
 * Native notification adapter wrapping Electron's Notification class.
 */
export class ElectronNativeNotifier implements INativeNotifier {
  private _notificationsMap: Map<string, Notification> = new Map();
  constructor(private _logger: ILogger) {}

  showNewJobs(opts: { title: string; body: string; silent?: boolean; onClick?: () => void }): void {
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent ?? false,
    });

    const notificationId = new Date().getTime().toString();
    this._notificationsMap.set(notificationId, notification);
    notification.on('click', () => {
      try {
        opts.onClick?.();
      } finally {
        this._notificationsMap.delete(notificationId);
      }
    });
    try {
      notification.show();
    } catch (err) {
      this._logger.info(`native notification failed (headless?): ${getExceptionMessage(err)}`);
    }
  }
}

/**
 * Sleep prevention via Electron's powerSaveBlocker.
 */
export class ElectronSleepPreventer implements ISleepPreventer {
  private _blockerId: number | undefined;
  constructor(private _logger: ILogger) {}

  prevent(): void {
    if (typeof this._blockerId === 'number') return;
    this._blockerId = powerSaveBlocker.start('prevent-app-suspension');
    this._logger.info(`prevent sleep started: ${this._blockerId}`);
  }

  release(): void {
    if (typeof this._blockerId !== 'number') return;
    powerSaveBlocker.stop(this._blockerId);
    this._blockerId = undefined;
  }
}
