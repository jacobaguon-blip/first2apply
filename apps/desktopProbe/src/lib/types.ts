import { WebPageRuntimeData } from '@first2apply/core';

export const AVAILABLE_CRON_RULES = [
  {
    name: 'Every 30 minutes',
    value: '*/30 * * * *',
  },
  {
    name: 'Every hour',
    value: '0 * * * *',
  },
  {
    name: 'Every 2 hours',
    value: '0 */2 * * *',
  },
  {
    name: 'Every 4 hours',
    value: '0 */4 * * *',
  },
  {
    name: 'Every 8 hours',
    value: '0 */8 * * *',
  },
  {
    name: 'Every 12 hours',
    value: '0 */12 * * *',
  },
  {
    name: 'Every day',
    value: '0 0 * * *',
  },
  {
    name: 'Every 3 days',
    value: '0 0 */3 * *',
  },
  {
    name: 'Every week',
    value: '0 0 * * 0',
  },
];
export type CronRule = (typeof AVAILABLE_CRON_RULES)[number];

export type JobScannerSettings = {
  cronRule?: string;
  preventSleep: boolean;
  useSound: boolean;
  areEmailAlertsEnabled: boolean;
  inAppBrowserEnabled: boolean;
  pushoverEnabled?: boolean;
  pushoverAppToken?: string;
  pushoverUserKey?: string;
};

export type NewAppVersion = {
  name: string;
  url: string;
  message: string;
};

export type OverlayBrowserViewResult = {
  url: string;
  title: string;
  html: string;
  webPageRuntimeData: WebPageRuntimeData;
};

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type QuietHoursDay = {
  enabled: boolean;
  /** HH:mm, 00:00–23:59 */
  start: string;
  /** HH:mm; if < start, the window spans into the next day */
  end: string;
};

export type QuietHoursSchedule = Record<DayKey, QuietHoursDay>;

export type QuietHoursSettings = {
  enabled: boolean;
  timezone: string; // IANA
  schedule: QuietHoursSchedule;
  graceMinutes: number;
  pushoverOwnerDeviceId: string | null;
  /** Local-only field; mirrors Supabase `updated_at` for reconciliation */
  updatedAt: string; // ISO
};

export const EMPTY_DAY: QuietHoursDay = { enabled: false, start: '22:00', end: '07:00' };
export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: false,
  timezone: 'UTC',
  schedule: {
    mon: { ...EMPTY_DAY }, tue: { ...EMPTY_DAY }, wed: { ...EMPTY_DAY },
    thu: { ...EMPTY_DAY }, fri: { ...EMPTY_DAY }, sat: { ...EMPTY_DAY }, sun: { ...EMPTY_DAY },
  },
  graceMinutes: 0,
  pushoverOwnerDeviceId: null,
  updatedAt: new Date(0).toISOString(),
};
