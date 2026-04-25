import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from '@first2apply/ui';

import {
  getQuietHoursDeviceId,
  getQuietHoursSettings,
  saveQuietHoursSettings,
} from '@/lib/electronMainSdk';
import {
  DEFAULT_QUIET_HOURS,
  DayKey,
  QuietHoursDay,
  QuietHoursSchedule,
  QuietHoursSettings as QuietHoursSettingsType,
} from '@/lib/types';

const DAY_ORDER: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const ALL_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function copyToAll(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of ALL_DAYS) next[k] = { ...day };
  return next;
}

function copyToWeekdays(schedule: QuietHoursSchedule, day: QuietHoursDay): QuietHoursSchedule {
  const next = { ...schedule };
  for (const k of WEEKDAY_DAYS) next[k] = { ...day };
  return next;
}

function pickTemplateDay(schedule: QuietHoursSchedule): QuietHoursDay {
  for (const k of ALL_DAYS) {
    if (schedule[k].enabled) return schedule[k];
  }
  return schedule.mon;
}

function safeSupportedTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') return fn('timeZone');
  } catch {
    /* ignore */
  }
  return ['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'];
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function QuietHoursSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<QuietHoursSettingsType>(DEFAULT_QUIET_HOURS);
  const [deviceId, setDeviceId] = useState<string>('');

  const timezones = useMemo(safeSupportedTimezones, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, did] = await Promise.all([getQuietHoursSettings(), getQuietHoursDeviceId()]);
        if (cancelled) return;
        // ensure we have a sensible timezone if blank
        if (!s.timezone) s.timezone = getLocalTimezone();
        setSettings(s);
        setDeviceId(did);
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Failed to load quiet hours',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDay = (key: DayKey, patch: Partial<QuietHoursDay>) => {
    setSettings((s) => ({
      ...s,
      schedule: { ...s.schedule, [key]: { ...s.schedule[key], ...patch } },
    }));
  };

  const onCopyToAll = () => {
    setSettings((s) => ({ ...s, schedule: copyToAll(s.schedule, pickTemplateDay(s.schedule)) }));
  };

  const onCopyToWeekdays = () => {
    setSettings((s) => ({ ...s, schedule: copyToWeekdays(s.schedule, pickTemplateDay(s.schedule)) }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await saveQuietHoursSettings(settings);
      setSettings(updated);
      toast({ title: 'Quiet hours saved' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to save quiet hours',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const isPushoverOwner = !!settings.pushoverOwnerDeviceId && settings.pushoverOwnerDeviceId === deviceId;

  if (loading) {
    return (
      <div className="space-y-4 rounded-lg border p-6">
        <div className="space-y-1">
          <h2 className="text-lg">Quiet hours</h2>
          <p className="text-sm font-light">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="flex flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-lg">Quiet hours</h2>
          <p className="text-sm font-light">
            Suppress Pushover notifications during configured times. New jobs are summarized and sent
            once quiet hours end.
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
        />
      </div>

      {settings.enabled && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="quiet-hours-tz">Timezone</Label>
              <Select
                value={settings.timezone || getLocalTimezone()}
                onValueChange={(v) => setSettings((s) => ({ ...s, timezone: v }))}
              >
                <SelectTrigger id="quiet-hours-tz">
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiet-hours-grace">
                Notify immediately if quiet hours end within ___ minutes (0 = strict)
              </Label>
              <Input
                id="quiet-hours-grace"
                type="number"
                min={0}
                value={settings.graceMinutes}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, graceMinutes: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCopyToAll}>
              Copy to all days
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCopyToWeekdays}>
              Copy to weekdays
            </Button>
          </div>

          <div className="space-y-2">
            {DAY_ORDER.map(({ key, label }) => {
              const day = settings.schedule[key];
              return (
                <div key={key} className="flex flex-row items-center gap-4">
                  <div className="flex w-28 items-center gap-2">
                    <Switch
                      id={`quiet-hours-day-${key}`}
                      checked={day.enabled}
                      onCheckedChange={(checked) => setDay(key, { enabled: checked })}
                    />
                    <Label htmlFor={`quiet-hours-day-${key}`}>{label}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`quiet-hours-${key}-start`} className="text-xs font-light">
                      Start
                    </Label>
                    <Input
                      id={`quiet-hours-${key}-start`}
                      type="time"
                      value={day.start}
                      disabled={!day.enabled}
                      onChange={(e) => setDay(key, { start: e.target.value })}
                      className="w-32"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`quiet-hours-${key}-end`} className="text-xs font-light">
                      End
                    </Label>
                    <Input
                      id={`quiet-hours-${key}-end`}
                      type="time"
                      value={day.end}
                      disabled={!day.enabled}
                      onChange={(e) => setDay(key, { end: e.target.value })}
                      className="w-32"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-row items-center justify-between gap-6 border-t pt-4">
        <div className="space-y-1">
          <h3 className="text-base">This device sends Pushover notifications</h3>
          <p className="text-sm font-light">
            Only one device should send Pushover at a time.
            {isPushoverOwner && (
              <>
                {' '}
                <span className="font-medium">Other devices will not send Pushover.</span>
              </>
            )}
          </p>
        </div>
        <Switch
          checked={isPushoverOwner}
          onCheckedChange={(checked) =>
            setSettings((s) => ({ ...s, pushoverOwnerDeviceId: checked ? deviceId : null }))
          }
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
