# Master Content IPC Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire `apps/desktopProbe/src/pages/master-content.tsx` end-to-end so the Save button persists resume / cover-letter JSON to `account_master_resume` / `account_master_cover_letter` and the page hydrates from those rows on mount.

**Architecture:** Follow the existing pattern used by every other write in the app — add a method to `F2aSupabaseApi` (libraries/ui), expose it via `ipcMain.handle` in `apps/desktopProbe/src/server/rendererIpcApi.ts`, add a thin wrapper in `apps/desktopProbe/src/lib/electronMainSdk.tsx`, then call it from the page. Account ID is resolved server-side by querying `account_members` for the authenticated user (RLS scopes the query). The migration `20260425110000_master_content_and_accounts.sql` ships an `ensure_personal_account` trigger that creates the row on first profile insert, so no manual `accounts` row creation is needed in the handler.

**Tech Stack:** Electron IPC, Supabase JS client, TypeScript, Vitest, existing `F2aSupabaseApi` pattern.

**Pre-flight (user, one-time):**
1. `cd apps/backend && supabase db push` — applies `20260425110000_master_content_and_accounts.sql` and the parked `20260427120000_add_deleted_to_job_status.sql` to the cloud project.
2. Verify your row in `accounts` exists: in the Supabase SQL editor run `select * from accounts where owner_user_id = '3fd66611-d62f-4506-837f-5acd59c92120';`. If empty, the trigger didn't fire for your existing user — insert manually: `insert into accounts (name, owner_user_id) values ('Personal', '3fd66611-d62f-4506-837f-5acd59c92120') returning id;` then `insert into account_members (account_id, user_id, role) values ('<that id>', '3fd66611-d62f-4506-837f-5acd59c92120', 'owner');`.

---

### Task 1: Extend `DbSchema` with the new tables

**Why:** `F2aSupabaseApi` is typed `SupabaseClient<DbSchema>` (libraries/core/src/types.ts:214). `DbSchema` is hand-written and currently has no `accounts`, `account_master_resume`, or `account_master_cover_letter`. Without adding them, `.from('account_master_resume')` won't typecheck. We add minimal entries — no need to touch the parked `DbSchema → Database` unification work.

**Files:**
- Modify: `libraries/core/src/types.ts:214` (add three table entries to the `Tables` record)
- Reference shape: `libraries/core/src/database.types.ts:17-110` (generated types — copy the `Row` columns from there, not the full generic shape)

**Step 1: Define domain types alongside DbSchema**

In `libraries/core/src/types.ts`, before the `DbSchema` declaration, add:

```typescript
export type MasterContentSection = 'resume' | 'cover_letter';

export type AccountMasterResumeRow = {
  account_id: string;
  content_jsonb: unknown;
  uploaded_filename: string | null;
  uploaded_at: string;
  updated_at: string;
};

export type AccountMasterCoverLetterRow = AccountMasterResumeRow;

export type AccountRow = {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
};

export type AccountMemberRow = {
  account_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  added_at: string;
};
```

**Step 2: Add the table entries to `DbSchema.public.Tables`**

```typescript
accounts: {
  Row: AccountRow;
  Insert: Pick<AccountRow, 'name' | 'owner_user_id'>;
  Update: {};
  Relationships: [];
};
account_members: {
  Row: AccountMemberRow;
  Insert: AccountMemberRow;
  Update: {};
  Relationships: [];
};
account_master_resume: {
  Row: AccountMasterResumeRow;
  Insert: Pick<AccountMasterResumeRow, 'account_id' | 'content_jsonb'> &
    Partial<Pick<AccountMasterResumeRow, 'uploaded_filename'>>;
  Update: Partial<Pick<AccountMasterResumeRow, 'content_jsonb' | 'uploaded_filename'>>;
  Relationships: [];
};
account_master_cover_letter: {
  Row: AccountMasterCoverLetterRow;
  Insert: Pick<AccountMasterCoverLetterRow, 'account_id' | 'content_jsonb'> &
    Partial<Pick<AccountMasterCoverLetterRow, 'uploaded_filename'>>;
  Update: Partial<Pick<AccountMasterCoverLetterRow, 'content_jsonb' | 'uploaded_filename'>>;
  Relationships: [];
};
```

**Step 3: Re-export from `index.ts` if needed**

Check `libraries/core/src/index.ts` — if other types from `types.ts` are re-exported there, add the new ones too.

**Step 4: Build the lib**

Run: `cd libraries/core && npm run build`
Expected: PASS (no type errors).

**Step 5: Commit**

```bash
git add libraries/core/src/types.ts libraries/core/src/index.ts
git commit -m "feat(core): add master-content + accounts tables to DbSchema"
```

---

### Task 2: Add `upsertMasterContent` + `getMasterContent` to `F2aSupabaseApi`

**Files:**
- Modify: `libraries/ui/src/lib/supabaseApi.ts` (follow the `createReview` pattern at line ~484)

**Step 1: Write the failing test**

Create `libraries/ui/src/lib/supabaseApi.masterContent.test.ts`:

```typescript
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
```

**Step 2: Run the test to verify it fails**

Run: `cd libraries/ui && npx vitest run src/lib/supabaseApi.masterContent.test.ts`
Expected: FAIL — `api.upsertMasterContent is not a function`.

**Step 3: Implement the methods**

In `libraries/ui/src/lib/supabaseApi.ts`, add (near `createReview`):

```typescript
async upsertMasterContent({
  kind,
  content,
  filename,
}: {
  kind: 'resume' | 'cover_letter';
  content: unknown;
  filename: string | null;
}) {
  const {
    data: { user },
  } = await this._supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: membership, error: memberErr } = await this._supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr) throw memberErr;
  if (!membership) throw new Error('No account found for user — run ensure_personal_account');

  const table = kind === 'resume' ? 'account_master_resume' : 'account_master_cover_letter';
  const row = {
    account_id: membership.account_id,
    content_jsonb: content,
    uploaded_filename: filename,
  };
  const { data, error } = await this._supabase
    .from(table)
    .upsert(row, { onConflict: 'account_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async getMasterContent({ kind }: { kind: 'resume' | 'cover_letter' }) {
  const {
    data: { user },
  } = await this._supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: membership } = await this._supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return null;

  const table = kind === 'resume' ? 'account_master_resume' : 'account_master_cover_letter';
  const { data, error } = await this._supabase
    .from(table)
    .select('content_jsonb, uploaded_filename, updated_at')
    .eq('account_id', membership.account_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

**Step 4: Run the test to verify it passes**

Run: `cd libraries/ui && npx vitest run src/lib/supabaseApi.masterContent.test.ts`
Expected: PASS (4/4).

**Step 5: Commit**

```bash
git add libraries/ui/src/lib/supabaseApi.ts libraries/ui/src/lib/supabaseApi.masterContent.test.ts
git commit -m "feat(ui): add upsertMasterContent + getMasterContent to F2aSupabaseApi"
```

---

### Task 3: Expose IPC handlers

**Files:**
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts` (add two handlers near the `create-user-review` block, line ~171)

**Step 1: Add the handlers**

```typescript
ipcMain.handle('upsert-master-content', async (event, { kind, content, filename }) =>
  _apiCall(async () => {
    const data = await supabaseApi.upsertMasterContent({ kind, content, filename });
    return { data };
  }),
);

ipcMain.handle('get-master-content', async (event, { kind }) =>
  _apiCall(async () => {
    const data = await supabaseApi.getMasterContent({ kind });
    return { data };
  }),
);
```

**Step 2: Build desktopProbe to confirm no type errors in the IPC file**

Run: `cd apps/desktopProbe && npx tsc --noEmit -p tsconfig.json`
Expected: No new errors introduced. (Pre-existing errors from the parked DbSchema drift may still appear — diff against `git stash` baseline if unsure.)

**Step 3: Commit**

```bash
git add apps/desktopProbe/src/server/rendererIpcApi.ts
git commit -m "feat(desktop): IPC handlers for master content upsert/get"
```

---

### Task 4: Renderer SDK wrapper

**Files:**
- Modify: `apps/desktopProbe/src/lib/electronMainSdk.tsx` (add two functions, follow the pattern of any existing `invoke` wrapper such as `createNote` or `createReview`)

**Step 1: Add the SDK functions**

```typescript
export async function upsertMasterContent({
  kind,
  content,
  filename,
}: {
  kind: 'resume' | 'cover_letter';
  content: unknown;
  filename: string | null;
}) {
  const { data, error } = await window.electron.invoke('upsert-master-content', {
    kind,
    content,
    filename,
  });
  if (error) throw new Error(error);
  return data;
}

export async function getMasterContent({ kind }: { kind: 'resume' | 'cover_letter' }) {
  const { data, error } = await window.electron.invoke('get-master-content', { kind });
  if (error) throw new Error(error);
  return data;
}
```

If the file uses a class (`ElectronApiSdk implements First2ApplyApiSdk`), also add:
- entries on the `First2ApplyApiSdk` interface (search the file for it)
- `upsertMasterContent = upsertMasterContent;` and `getMasterContent = getMasterContent;` on the class

**Step 2: Commit**

```bash
git add apps/desktopProbe/src/lib/electronMainSdk.tsx
git commit -m "feat(desktop): renderer SDK wrappers for master content"
```

---

### Task 5: Wire the page

**Files:**
- Modify: `apps/desktopProbe/src/pages/master-content.tsx:36-52` (replace the stub `onSave`) + add a `useEffect` to hydrate on mount.

**Step 1: Replace the stub**

```typescript
import { useEffect, useState } from 'react';
import { upsertMasterContent, getMasterContent } from '../lib/electronMainSdk';

// ... inside the component:

useEffect(() => {
  (async () => {
    try {
      const [resume, cover] = await Promise.all([
        getMasterContent({ kind: 'resume' }),
        getMasterContent({ kind: 'cover_letter' }),
      ]);
      if (resume?.content_jsonb) setResumeJson(JSON.stringify(resume.content_jsonb, null, 2));
      if (cover?.content_jsonb) setCoverJson(JSON.stringify(cover.content_jsonb, null, 2));
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  })();
}, []);

const onSave = async () => {
  setSaving(true);
  setStatus(null);
  try {
    const raw = tab === 'resume' ? resumeJson : coverJson;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1) throw new Error('JSON must include "version": 1');
    await upsertMasterContent({ kind: tab, content: parsed, filename });
    setStatus({ kind: 'ok', msg: 'Saved.' });
  } catch (e) {
    setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
  } finally {
    setSaving(false);
  }
};
```

**Step 2: Manual smoke test**

1. `cd apps/desktopProbe && npm run start` (or whatever the dev launch command is — check package.json `scripts.start`).
2. Log in as `jacob.aguon@conductorone.com`.
3. Navigate to the Master Content page.
4. Paste the contents of `tests/fixtures/master-content/master-resume.fixture.json` into the textarea.
5. Click Save → expect green "Saved." status.
6. Reload the app → expect the textarea to hydrate with the same content.
7. Switch tab to Cover Letter, paste `master-cover-letter.fixture.json`, Save, reload, verify hydration.
8. Verify in Supabase SQL editor: `select account_id, content_jsonb->'version', updated_at from account_master_resume; select account_id, content_jsonb->'version', updated_at from account_master_cover_letter;` — both should have one row.

**Step 3: Commit**

```bash
git add apps/desktopProbe/src/pages/master-content.tsx
git commit -m "feat(desktop): wire master content page to upsert/get IPC"
```

---

### Task 6: PR

```bash
gh pr create --title "feat: wire master-content page end-to-end" --body "..."
```

PR body should note:
- Pre-flight migration push required.
- DbSchema extension is intentionally minimal — does not unblock the parked `DbSchema → Database` work.
- Tests added: `libraries/ui/src/lib/supabaseApi.masterContent.test.ts`.
- Manual smoke test results.

---

## Risks / blockers

1. **Migration not pushed to cloud** — handler will fail with `relation "account_master_resume" does not exist` until `supabase db push` runs. Pre-flight covers this.
2. **`ensure_personal_account` trigger may not fire for users created before the migration** — that's why the pre-flight has a manual insert fallback for jacob's existing user.
3. **DbSchema drift (parked)** — adding 4 tables to `DbSchema` is contained; doesn't touch `Job`/`Link`/`UserSettings` mismatches that drove the park decision.
4. **PDF/DOCX upload still TODO** — out of scope; the page accepts JSON only, with a clear error on .pdf/.docx selection. File a follow-up.
