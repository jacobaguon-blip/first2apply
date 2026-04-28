/**
 * Scanner runtime configuration. Shared across desktop + server consumers.
 */

export const AVAILABLE_CRON_RULES = [
  { name: 'Every 30 minutes', value: '*/30 * * * *' },
  { name: 'Every hour', value: '0 * * * *' },
  { name: 'Every 2 hours', value: '0 */2 * * *' },
  { name: 'Every 4 hours', value: '0 */4 * * *' },
  { name: 'Every 8 hours', value: '0 */8 * * *' },
  { name: 'Every 12 hours', value: '0 */12 * * *' },
  { name: 'Every day', value: '0 0 * * *' },
] as const;

export type JobScannerSettings = {
  cronRule?: string;
  preventSleep: boolean;
  useSound: boolean;
  areEmailAlertsEnabled: boolean;
  inAppBrowserEnabled: boolean;
  pushoverEnabled?: boolean;
  pushoverAppToken?: string;
  pushoverUserKey?: string;
  isPaused?: boolean;
};

export const DEFAULT_JOB_SCANNER_SETTINGS: JobScannerSettings = {
  cronRule: AVAILABLE_CRON_RULES[1].value, // every 1h
  preventSleep: true,
  useSound: true,
  areEmailAlertsEnabled: true,
  inAppBrowserEnabled: true,
};
