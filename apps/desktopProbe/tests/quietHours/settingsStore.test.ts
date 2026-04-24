import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { QuietHoursSettingsStore } from '../../src/server/quietHours/settingsStore';
import { DEFAULT_QUIET_HOURS } from '../../src/lib/types';

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qh-')), 'settings.json');
}

const okSb = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
    upsert: async (_row: any) => ({ data: null, error: null }),
  }),
};

test('load returns defaults when nothing exists', async () => {
  const s = new QuietHoursSettingsStore({ filePath: tmpFile(), userId: 'u', supabase: okSb as any });
  expect(await s.load()).toEqual(DEFAULT_QUIET_HOURS);
});

test('load returns local when Supabase fails', async () => {
  const file = tmpFile();
  const local = { ...DEFAULT_QUIET_HOURS, enabled: true, updatedAt: '2026-04-20T00:00:00.000Z' };
  fs.writeFileSync(file, JSON.stringify(local));
  const failingSb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('net') }) }) }),
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: failingSb as any });
  const got = await s.load();
  expect(got.enabled).toBe(true);
});

test('save writes supabase first then local', async () => {
  const file = tmpFile();
  let upserted: any = null;
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async (row: any) => { upserted = row; return { data: null, error: null }; },
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: sb as any });
  await s.save({ enabled: true });
  expect(upserted.quiet_hours_enabled).toBe(true);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).enabled).toBe(true);
});

test('save throws and does not update local on supabase failure', async () => {
  const file = tmpFile();
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ data: null, error: new Error('denied') }),
    }),
  };
  const s = new QuietHoursSettingsStore({ filePath: file, userId: 'u', supabase: sb as any });
  await expect(s.save({ enabled: true })).rejects.toThrow('denied');
  expect(fs.existsSync(file)).toBe(false);
});
