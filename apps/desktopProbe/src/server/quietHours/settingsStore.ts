import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_QUIET_HOURS, QuietHoursSettings } from '../../lib/types';

type Opts = { filePath: string; userId: string; supabase: SupabaseClient };

export class QuietHoursSettingsStore {
  constructor(private opts: Opts) {}

  private readLocal(): QuietHoursSettings | null {
    try {
      const raw = fs.readFileSync(this.opts.filePath, 'utf8');
      return { ...DEFAULT_QUIET_HOURS, ...JSON.parse(raw) };
    } catch { return null; }
  }

  private writeLocal(s: QuietHoursSettings) {
    fs.mkdirSync(path.dirname(this.opts.filePath), { recursive: true });
    fs.writeFileSync(this.opts.filePath, JSON.stringify(s, null, 2));
  }

  async load(): Promise<QuietHoursSettings> {
    const local = this.readLocal() ?? DEFAULT_QUIET_HOURS;
    try {
      const { data, error } = await this.opts.supabase
        .from('user_settings').select('*').eq('user_id', this.opts.userId).maybeSingle();
      if (error || !data) return local;
      const remote = this.fromRow(data);
      if (new Date(remote.updatedAt) > new Date(local.updatedAt)) {
        this.writeLocal(remote);
        return remote;
      }
      return local;
    } catch {
      return local;
    }
  }

  async save(patch: Partial<QuietHoursSettings>): Promise<QuietHoursSettings> {
    const current = this.readLocal() ?? DEFAULT_QUIET_HOURS;
    const next: QuietHoursSettings = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const { error } = await this.opts.supabase
      .from('user_settings').upsert(this.toRow(next), { onConflict: 'user_id' });
    if (error) throw error;
    this.writeLocal(next);
    return next;
  }

  private toRow(s: QuietHoursSettings) {
    return {
      user_id: this.opts.userId,
      quiet_hours_enabled: s.enabled,
      quiet_hours_timezone: s.timezone,
      quiet_hours_schedule: s.schedule,
      quiet_hours_grace_minutes: s.graceMinutes,
      pushover_owner_device_id: s.pushoverOwnerDeviceId,
    };
  }

  private fromRow(r: any): QuietHoursSettings {
    return {
      enabled: !!r.quiet_hours_enabled,
      timezone: r.quiet_hours_timezone ?? 'UTC',
      schedule: r.quiet_hours_schedule ?? DEFAULT_QUIET_HOURS.schedule,
      graceMinutes: r.quiet_hours_grace_minutes ?? 0,
      pushoverOwnerDeviceId: r.pushover_owner_device_id ?? null,
      updatedAt: r.updated_at ?? new Date(0).toISOString(),
    };
  }
}
