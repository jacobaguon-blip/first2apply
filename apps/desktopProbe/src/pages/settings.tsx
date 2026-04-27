import { CronSchedule } from '@/components/cronSchedule';
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton';
import { useAppState } from '@/hooks/appState';
import { useError } from '@/hooks/error';
import { useSession } from '@/hooks/session';
import { useSettings } from '@/hooks/settings';
import {
  applyAppUpdate,
  getSupabaseConfig,
  getUserSettings,
  logout,
  openExternalUrl,
  setSupabaseConfig,
  SupabaseConfigInfo,
  testSupabaseConnection,
  upsertUserSettings,
} from '@/lib/electronMainSdk';
import type { QuietHoursDay, QuietHoursSchedule, UserSettings } from '@first2apply/core';
import { JobScannerSettings } from '@/lib/types';
import { Button } from '@first2apply/ui';
import { Input } from '@first2apply/ui';
import { Label } from '@first2apply/ui';
import { Switch } from '@first2apply/ui';

import { useEffect, useState } from 'react';

import { DefaultLayout } from './defaultLayout';

export function SettingsPage() {
  const { handleError } = useError();
  const { isLoading: isLoadingSession, logout: resetUser, user, profile, stripeConfig } = useSession();
  const { isLoading: isLoadingSettings, settings, updateSettings } = useSettings();
  const { newUpdate } = useAppState();

  const isLoading = !profile || !stripeConfig || isLoadingSettings || isLoadingSession;
  const hasNewUpdate = !!newUpdate;

  // Update settings
  const onUpdatedSettings = async (newSettings: JobScannerSettings) => {
    try {
      await updateSettings(newSettings);
    } catch (error) {
      handleError({ error });
    }
  };

  // Logout
  const onLogout = async () => {
    try {
      await logout();
      resetUser();
    } catch (error) {
      handleError({ error });
    }
  };

  // Update cron rule
  const onCronRuleChange = async (cronRule: string | undefined) => {
    try {
      const newSettings = { ...settings, cronRule };
      await updateSettings(newSettings);
    } catch (error) {
      handleError({ error, title: 'Failed to update notification frequency' });
    }
  };

  // Backend (Supabase) config
  const [backendConfig, setBackendConfig] = useState<SupabaseConfigInfo | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [backendKey, setBackendKey] = useState('');
  const [backendTesting, setBackendTesting] = useState(false);
  const [backendSaving, setBackendSaving] = useState(false);
  const [backendStatus, setBackendStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    getSupabaseConfig()
      .then((cfg) => {
        setBackendConfig(cfg);
        setBackendUrl(cfg.url);
        setBackendKey(cfg.key);
      })
      .catch((error) => handleError({ error, title: 'Failed to load backend config' }));
  }, []);

  const onTestBackend = async () => {
    setBackendStatus(null);
    setBackendTesting(true);
    try {
      await testSupabaseConnection({ url: backendUrl, key: backendKey });
      setBackendStatus({ kind: 'ok', msg: 'Connection successful' });
    } catch (error) {
      setBackendStatus({ kind: 'err', msg: error instanceof Error ? error.message : String(error) });
    } finally {
      setBackendTesting(false);
    }
  };

  const onSaveBackend = async () => {
    if (!confirm('Saving will restart the app. Continue?')) return;
    setBackendSaving(true);
    setBackendStatus(null);
    try {
      await setSupabaseConfig({ url: backendUrl, key: backendKey });
      // app will relaunch; nothing more to do here
    } catch (error) {
      setBackendSaving(false);
      setBackendStatus({ kind: 'err', msg: error instanceof Error ? error.message : String(error) });
    }
  };

  // Quiet hours state
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [qhLoaded, setQhLoaded] = useState(false);
  const [qhSaving, setQhSaving] = useState(false);
  const [qhStatus, setQhStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const tzOptions: string[] = (() => {
    // Intl.supportedValuesOf is available on Node 18+/modern Electron.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') {
      try {
        return fn('timeZone');
      } catch {
        // fall through
      }
    }
    return [
      'UTC',
      'America/Los_Angeles',
      'America/Denver',
      'America/Chicago',
      'America/New_York',
      'Europe/London',
      'Europe/Berlin',
      'Europe/Paris',
      'Asia/Tokyo',
      'Asia/Singapore',
      'Australia/Sydney',
    ];
  })();

  useEffect(() => {
    getUserSettings()
      .then((s) => {
        setUserSettings(s);
        setQhLoaded(true);
      })
      .catch((error) => {
        setQhLoaded(true);
        handleError({ error, title: 'Failed to load quiet-hours settings' });
      });
  }, []);

  const qhEnabled = !!userSettings?.quiet_hours_enabled;
  const qhTimezone = userSettings?.quiet_hours_timezone ?? 'UTC';
  const qhSchedule: QuietHoursSchedule = userSettings?.quiet_hours_schedule ?? {};
  const qhGrace = userSettings?.quiet_hours_grace_minutes ?? 0;

  const updateQuietHours = async (
    patch: Partial<
      Pick<
        UserSettings,
        | 'quiet_hours_enabled'
        | 'quiet_hours_timezone'
        | 'quiet_hours_schedule'
        | 'quiet_hours_grace_minutes'
      >
    >,
  ) => {
    setQhSaving(true);
    setQhStatus(null);
    try {
      const next = await upsertUserSettings({
        quiet_hours_enabled: patch.quiet_hours_enabled ?? qhEnabled,
        quiet_hours_timezone: patch.quiet_hours_timezone ?? qhTimezone,
        quiet_hours_schedule: patch.quiet_hours_schedule ?? qhSchedule,
        quiet_hours_grace_minutes: patch.quiet_hours_grace_minutes ?? qhGrace,
      });
      setUserSettings(next);
      setQhStatus({ kind: 'ok', msg: 'Saved' });
    } catch (error) {
      setQhStatus({
        kind: 'err',
        msg: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setQhSaving(false);
    }
  };

  const setDayWindow = async (
    day: QuietHoursDay,
    field: 'start' | 'end' | 'off',
    value: string | boolean,
  ) => {
    const nextSchedule: QuietHoursSchedule = { ...qhSchedule };
    if (field === 'off') {
      if (value === true) delete nextSchedule[day];
      else nextSchedule[day] = nextSchedule[day] ?? { start: '22:00', end: '07:00' };
    } else {
      const current = nextSchedule[day] ?? { start: '22:00', end: '07:00' };
      nextSchedule[day] = { ...current, [field]: String(value) };
    }
    await updateQuietHours({ quiet_hours_schedule: nextSchedule });
  };

  const onApplyUpdate = async () => {
    try {
      await applyAppUpdate();
    } catch (error) {
      handleError({ error });
    }
  };

  if (isLoading) {
    return (
      <DefaultLayout className="space-y-3 p-6 md:p-10">
        <SettingsSkeleton />
      </DefaultLayout>
    );
  }

  return (
    <DefaultLayout className="space-y-3 p-6 md:p-10">
      <h1 className="pb-3 text-2xl font-medium tracking-wide">Settings ({user.email})</h1>

      {/* new updates */}
      {hasNewUpdate && (
        <div className="flex flex-row items-center justify-between gap-6 rounded-lg border border-destructive p-6">
          <div className="space-y-1">
            <h2 className="text-lg">
              New update available <span className="font-bold">{newUpdate.name}</span>
            </h2>
            <p className="text-sm font-light">{newUpdate.message}</p>
          </div>
          <Button className="w-fit" onClick={() => onApplyUpdate()}>
            Update
          </Button>
        </div>
      )}

      {/* pause scanning */}
      <div className="flex flex-row items-center justify-between gap-6 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Pause scanning {settings.isPaused && <span className="ml-2 rounded bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">PAUSED</span>}</h2>
          <p className="text-sm font-light">Stop all scheduled and manual scans. Useful during development to avoid rebuild-triggered scans.</p>
        </div>
        <Switch
          checked={!!settings.isPaused}
          onCheckedChange={(checked) => onUpdatedSettings({ ...settings, isPaused: checked })}
        />
      </div>

      {/* cron settings */}
      <CronSchedule cronRule={settings.cronRule} onCronRuleChange={onCronRuleChange} />

      {/* sleep settings */}
      <div className="flex flex-row items-center justify-between gap-6 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Prevent computer from entering sleep</h2>
          <p className="text-sm font-light">First2Apply needs to run in the background to notify you of new jobs</p>
        </div>
        <Switch
          checked={settings.preventSleep}
          onCheckedChange={(checked) => onUpdatedSettings({ ...settings, preventSleep: checked })}
        />
      </div>

      {/* notification settings */}
      <div className="flex flex-row items-center justify-between gap-6 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Enable notification sounds</h2>
          <p className="text-sm font-light">Play a sound when a new job is found in order to get your attention</p>
        </div>
        <Switch
          checked={settings.useSound}
          onCheckedChange={(checked) => onUpdatedSettings({ ...settings, useSound: checked })}
        />
      </div>

      {/* email notifications */}
      <div className="flex flex-row items-center justify-between gap-6 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Email notifications</h2>
          <p className="text-sm font-light">Get notified of new jobs even when you are on the go</p>
        </div>
        <Switch
          checked={settings.areEmailAlertsEnabled}
          onCheckedChange={(checked) => onUpdatedSettings({ ...settings, areEmailAlertsEnabled: checked })}
        />
      </div>

      {/* Pushover notifications */}
      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-lg">Pushover notifications</h2>
            <p className="text-sm font-light">
              Send push notifications to your phone via{' '}
              <button
                type="button"
                className="underline"
                onClick={() => openExternalUrl('https://pushover.net/')}
              >
                Pushover
              </button>
              . Create an app there to get an app token; your user key is on your Pushover dashboard.
            </p>
          </div>
          <Switch
            checked={!!settings.pushoverEnabled}
            onCheckedChange={(checked) => onUpdatedSettings({ ...settings, pushoverEnabled: checked })}
          />
        </div>
        {settings.pushoverEnabled && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pushover-app-token">App token</Label>
              <Input
                id="pushover-app-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={settings.pushoverAppToken ?? ''}
                onChange={(e) => onUpdatedSettings({ ...settings, pushoverAppToken: e.target.value })}
                placeholder="axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pushover-user-key">User key</Label>
              <Input
                id="pushover-user-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={settings.pushoverUserKey ?? ''}
                onChange={(e) => onUpdatedSettings({ ...settings, pushoverUserKey: e.target.value })}
                placeholder="uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          </div>
        )}
      </div>

      {/* Quiet hours */}
      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-lg">Quiet hours</h2>
            <p className="text-sm font-light">
              Suppress Pushover summaries during configured local-time windows. Jobs found
              during a window are deferred until it ends — no notifications are lost.
            </p>
          </div>
          <Switch
            checked={qhEnabled}
            disabled={!qhLoaded || qhSaving}
            onCheckedChange={(checked) => updateQuietHours({ quiet_hours_enabled: checked })}
          />
        </div>
        {qhEnabled && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="qh-timezone">Timezone</Label>
                <select
                  id="qh-timezone"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm"
                  value={qhTimezone}
                  disabled={qhSaving}
                  onChange={(e) => updateQuietHours({ quiet_hours_timezone: e.target.value })}
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="qh-grace">Grace period: {qhGrace} min</Label>
                <input
                  id="qh-grace"
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={qhGrace}
                  disabled={qhSaving}
                  onChange={(e) =>
                    updateQuietHours({ quiet_hours_grace_minutes: parseInt(e.target.value, 10) })
                  }
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              {(
                [
                  'monday',
                  'tuesday',
                  'wednesday',
                  'thursday',
                  'friday',
                  'saturday',
                  'sunday',
                ] as QuietHoursDay[]
              ).map((day) => {
                const win = qhSchedule[day];
                const off = !win;
                return (
                  <div key={day} className="grid grid-cols-12 items-center gap-2">
                    <Label className="col-span-3 capitalize">{day}</Label>
                    <div className="col-span-2 flex items-center gap-2">
                      <Switch
                        checked={!off}
                        disabled={qhSaving}
                        onCheckedChange={(checked) => setDayWindow(day, 'off', !checked)}
                      />
                      <span className="text-xs">{off ? 'off' : 'on'}</span>
                    </div>
                    <Input
                      type="time"
                      className="col-span-3"
                      disabled={off || qhSaving}
                      value={win?.start ?? '22:00'}
                      onChange={(e) => setDayWindow(day, 'start', e.target.value)}
                    />
                    <Input
                      type="time"
                      className="col-span-3"
                      disabled={off || qhSaving}
                      value={win?.end ?? '07:00'}
                      onChange={(e) => setDayWindow(day, 'end', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>

            {qhStatus && (
              <p
                className={`text-sm ${
                  qhStatus.kind === 'ok' ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {qhStatus.msg}
              </p>
            )}

            {userSettings?.last_summary_sent_at && (
              <p className="text-muted-foreground text-xs">
                Last summary sent: {new Date(userSettings.last_summary_sent_at).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* in-app browser settings */}
      <div className="flex flex-row items-center justify-between gap-6 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">In-app browser</h2>
          <p className="text-sm font-light">Use the in-app browser to view job listings without leaving the app</p>
        </div>
        <Switch
          checked={settings.inAppBrowserEnabled}
          onCheckedChange={(checked) => onUpdatedSettings({ ...settings, inAppBrowserEnabled: checked })}
        />
      </div>

      {/* Backend (Supabase) config */}
      <div className="space-y-4 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Backend (Supabase)</h2>
          <p className="text-sm font-light">
            Point the app at a Supabase project. Saving restarts the app.
            {backendConfig && (
              <>
                {' '}
                Currently using{' '}
                <span className="font-medium">
                  {backendConfig.source === 'user'
                    ? 'custom setting'
                    : backendConfig.source === 'env'
                    ? 'build-time default'
                    : 'no config'}
                </span>
                .
              </>
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="supabase-url">Project URL</Label>
            <Input
              id="supabase-url"
              autoComplete="off"
              spellCheck={false}
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supabase-key">Anon key</Label>
            <Input
              id="supabase-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={backendKey}
              onChange={(e) => setBackendKey(e.target.value)}
              placeholder="eyJhbGciOi..."
            />
          </div>
        </div>
        {backendStatus && (
          <p className={`text-sm ${backendStatus.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
            {backendStatus.msg}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onTestBackend} disabled={backendTesting || backendSaving}>
            {backendTesting ? 'Testing…' : 'Test connection'}
          </Button>
          <Button onClick={onSaveBackend} disabled={backendTesting || backendSaving}>
            {backendSaving ? 'Saving…' : 'Save & restart'}
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button className="w-fit" variant="destructive" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </DefaultLayout>
  );
}
