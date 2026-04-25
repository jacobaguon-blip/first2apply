import { CronSchedule } from '@/components/cronSchedule';
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton';
import { useAppState } from '@/hooks/appState';
import { useError } from '@/hooks/error';
import { useSession } from '@/hooks/session';
import { useSettings } from '@/hooks/settings';
import {
  applyAppUpdate,
  getSupabaseConfig,
  logout,
  openExternalUrl,
  setSupabaseConfig,
  SupabaseConfigInfo,
  testSupabaseConnection,
} from '@/lib/electronMainSdk';
import { JobScannerSettings } from '@/lib/types';
import { Button } from '@first2apply/ui';
import { Input } from '@first2apply/ui';
import { Label } from '@first2apply/ui';
import { Switch } from '@first2apply/ui';

import { useEffect, useState } from 'react';

import { QuietHoursSettings } from './components/quietHoursSettings';
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
