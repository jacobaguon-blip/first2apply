import { ENV } from '../env';

import { Logger as MezmoLogger, createLogger } from '@logdna/logger';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface ILogger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  error(message: string, data?: Record<string, any>): void;
  addMeta(key: string, value: string): void;
  flush(): void;
}

function openLogFile(): fs.WriteStream | null {
  try {
    const logsDir = app.getPath('logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'main.log');
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    stream.write(`\n===== ${new Date().toISOString()} app start (v${app.getVersion()}) =====\n`);
    return stream;
  } catch (err) {
    console.error('[logger] failed to open log file:', err);
    return null;
  }
}

const fileStream: fs.WriteStream | null = openLogFile();

function writeToFile(level: string, message: string, data?: Record<string, any>) {
  if (!fileStream) return;
  const ts = new Date().toISOString();
  const suffix = data ? ' ' + safeStringify(data) : '';
  fileStream.write(`[${ts}] [${level}] ${message}${suffix}\n`);
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

class Logger implements ILogger {
  private _meta: Record<string, string> = {};

  constructor(private _logger: MezmoLogger | null) {}

  debug(message: string, data?: Record<string, any>) {
    console.log(message, data);
    writeToFile('DEBUG', message, data);
    this._logger?.debug(message, { meta: data });
  }

  info(message: string, data?: Record<string, any>) {
    console.log(message, data);
    writeToFile('INFO', message, data);
    this._logger?.info(message, { meta: data });
  }

  error(message: string, data?: Record<string, any>) {
    console.error(message, data);
    writeToFile('ERROR', message, data);
    this._logger?.error(message, { meta: data });
  }

  addMeta(key: string, value: string) {
    this._meta[key] = value;
    this._logger?.addMetaProperty(key, value);
  }

  flush() {
    this._logger?.flush();
  }
}

const mezmoLogger = ENV.mezmoApiKey
  ? createLogger(ENV.mezmoApiKey, {
      level: ENV.nodeEnv === 'development' ? 'debug' : 'info',
      app: ENV.appBundleId,
      env: ENV.nodeEnv,
      hostname: process.platform,
      meta: {
        version: app.getVersion(),
        arch: process.arch,
      },
      indexMeta: true,
    })
  : null;
export const logger = new Logger(mezmoLogger);
