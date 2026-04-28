import { describe, expect, it, vi } from 'vitest';
import { F2aSupabaseApi } from './supabaseApi';

function makeStubSupabase(opts: {
  userId?: string;
  accountId?: string;
  upsertResult?: unknown;
  selectResult?: unknown;
}) {
  const calls: { table: string; op: string; args: unknown }[] = [];
  const builder = (table: string) => ({
    select: (cols: string) => ({
      eq: (_col: string, _val: string) => ({
        maybeSingle: async () => {
          calls.push({ table, op: 'select', args: { cols } });
          if (table === 'account_members') {
            return { data: opts.accountId ? { account_id: opts.accountId } : null, error: null };
          }
          return { data: opts.selectResult ?? null, error: null };
        },
      }),
    }),
    upsert: (row: unknown, _opts?: unknown) => ({
      select: () => ({
        single: async () => {
          calls.push({ table, op: 'upsert', args: row });
          return { data: opts.upsertResult ?? row, error: null };
        },
      }),
    }),
  });
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: opts.userId ?? null } }, error: null }) },
    from: (table: string) => builder(table),
  };
  return { supabase, calls };
}

describe('F2aSupabaseApi master content', () => {
  it('upsertMasterContent writes resume to the resume table keyed by account_id', async () => {
    const { supabase, calls } = makeStubSupabase({
      userId: 'u1',
      accountId: 'a1',
    });
    const api = new F2aSupabaseApi(supabase as never);
    await api.upsertMasterContent({
      kind: 'resume',
      content: { version: 1, name: 'Test' },
      filename: 'r.json',
    });
    const upsertCall = calls.find((c) => c.op === 'upsert');
    expect(upsertCall?.table).toBe('account_master_resume');
    expect(upsertCall?.args).toMatchObject({
      account_id: 'a1',
      content_jsonb: { version: 1, name: 'Test' },
      uploaded_filename: 'r.json',
    });
  });

  it('upsertMasterContent routes cover_letter to the cover-letter table', async () => {
    const { supabase, calls } = makeStubSupabase({ userId: 'u1', accountId: 'a1' });
    const api = new F2aSupabaseApi(supabase as never);
    await api.upsertMasterContent({
      kind: 'cover_letter',
      content: { version: 1 },
      filename: null,
    });
    expect(calls.find((c) => c.op === 'upsert')?.table).toBe('account_master_cover_letter');
  });

  it('upsertMasterContent throws if user has no account_members row', async () => {
    const { supabase } = makeStubSupabase({ userId: 'u1', accountId: undefined });
    const api = new F2aSupabaseApi(supabase as never);
    await expect(
      api.upsertMasterContent({ kind: 'resume', content: { version: 1 }, filename: null }),
    ).rejects.toThrow(/account/i);
  });

  it('getMasterContent returns null when no row exists', async () => {
    const { supabase } = makeStubSupabase({ userId: 'u1', accountId: 'a1', selectResult: null });
    const api = new F2aSupabaseApi(supabase as never);
    const result = await api.getMasterContent({ kind: 'resume' });
    expect(result).toBeNull();
  });
});
