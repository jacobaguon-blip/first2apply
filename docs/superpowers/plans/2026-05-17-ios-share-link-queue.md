# iOS Share-Sheet Link Queue Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement. Steps use `- [ ]` for tracking.

**Goal:** Let the user share any URL from iPhone Safari's Share Sheet and have it appear as a "targeted website" (link) in her First2Apply dashboard automatically.

**Architecture:** iOS Shortcut → new Supabase edge function `queue-pending-link` (auth via long-lived personal token) → `pending_links` table → desktop app's scan loop drains the queue, opens each URL in its Electron BrowserView to capture HTML, then routes through the existing `createLink` flow. Failed drains stay in the table with an error message and surface in a new dashboard panel.

**Tech Stack:** Supabase (Postgres + Deno edge functions), Electron + React (desktopProbe), Apple Shortcuts.

**Repo conventions noted:**
- Edge functions live at `apps/backend/supabase/functions/<name>/index.ts`. Auth via `getEdgeFunctionContext`. CORS via `_shared/cors.ts`.
- Migrations: `apps/backend/supabase/migrations/<UTC timestamp>_<name>.sql`. Latest timestamps are in 2026-04 range; use today's date `20260517...`.
- Desktop scanner is `libraries/scraper/src/jobScanner.ts` (class `JobScanner`). Desktop IPC entry: `apps/desktopProbe/src/server/rendererIpcApi.ts`. Existing tests: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts`.
- HTML capture for a URL is already implemented for `createLink` via the renderer; we re-use that path by invoking the same IPC `create-link` flow internally with an offscreen BrowserView (see `overlayBrowserView.ts`, `htmlDownloader.ts`).

---

## Chunk 1: Backend (DB + Edge Function)

### Task 1.1: `pending_links` migration

**Files:**
- Create: `apps/backend/supabase/migrations/20260517120000_pending_links.sql`

- [ ] **Step 1: Write migration**

```sql
create table if not exists public.pending_links (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  title         text,
  status        text not null default 'pending'
                check (status in ('pending', 'claimed', 'failed')),
  attempts      int  not null default 0,
  error_message text,
  source        text not null default 'ios-share',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pending_links_user_status_idx
  on public.pending_links (user_id, status, created_at);

alter table public.pending_links enable row level security;

create policy "users read own pending_links"
  on public.pending_links for select
  using (auth.uid() = user_id);

create policy "users insert own pending_links"
  on public.pending_links for insert
  with check (auth.uid() = user_id);

create policy "users delete own pending_links"
  on public.pending_links for delete
  using (auth.uid() = user_id);

-- updates happen only via service-role from desktop drain; no user update policy.
```

- [ ] **Step 2: Apply locally** — `pnpm supabase db reset` (or equivalent script in repo) and verify table exists.
- [ ] **Step 3: Commit** — `feat(db): pending_links queue for iOS share-sheet`.

### Task 1.2: `user_api_tokens` migration (personal long-lived tokens)

**Files:**
- Create: `apps/backend/supabase/migrations/20260517120100_user_api_tokens.sql`

- [ ] **Step 1: Write migration**

```sql
create table if not exists public.user_api_tokens (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,                          -- e.g. "iPhone Share"
  token_hash  text not null unique,                   -- sha256(token), never the raw token
  scopes      text[] not null default array['queue-link']::text[],
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists user_api_tokens_user_idx on public.user_api_tokens (user_id);

alter table public.user_api_tokens enable row level security;

create policy "users read own tokens"
  on public.user_api_tokens for select using (auth.uid() = user_id);
create policy "users insert own tokens"
  on public.user_api_tokens for insert with check (auth.uid() = user_id);
create policy "users revoke own tokens"
  on public.user_api_tokens for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit** — `feat(db): user_api_tokens table for long-lived personal tokens`.

### Task 1.3: Edge function `queue-pending-link`

**Files:**
- Create: `apps/backend/supabase/functions/queue-pending-link/index.ts`
- Create: `apps/backend/supabase/functions/queue-pending-link/deno.json`
- Reference: `apps/backend/supabase/functions/_shared/cors.ts`, `_shared/edgeFunctions.ts`, `_shared/logger.ts`

- [ ] **Step 1: Implementation**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { CORS_HEADERS } from '../_shared/cors.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const logger = createLoggerWithMeta({ function: 'queue-pending-link' });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method-not-allowed' }), {
        status: 405, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }

    const token = req.headers.get('x-f2a-token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'missing-token' }), {
        status: 401, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const hash = await sha256Hex(token);

    const { data: tokenRow, error: tokenErr } = await admin
      .from('user_api_tokens')
      .select('id, user_id, scopes, revoked_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    if (!tokenRow || tokenRow.revoked_at) {
      return new Response(JSON.stringify({ error: 'invalid-token' }), {
        status: 401, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }
    if (!tokenRow.scopes?.includes('queue-link')) {
      return new Response(JSON.stringify({ error: 'insufficient-scope' }), {
        status: 403, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }

    const body = (await req.json().catch(() => ({}))) as { url?: string; title?: string };
    const url = (body.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'invalid-url' }), {
        status: 400, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }
    const title = (body.title ?? '').slice(0, 256) || null;

    // rate-limit: max 30 pending per user
    const { count } = await admin
      .from('pending_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', tokenRow.user_id)
      .eq('status', 'pending');
    if ((count ?? 0) >= 30) {
      return new Response(JSON.stringify({ error: 'queue-full' }), {
        status: 429, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }

    // dedupe: same url already pending → return existing id
    const { data: existing } = await admin
      .from('pending_links')
      .select('id')
      .eq('user_id', tokenRow.user_id)
      .eq('url', url)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ id: existing.id, deduped: true }), {
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      });
    }

    const { data: inserted, error: insErr } = await admin
      .from('pending_links')
      .insert({ user_id: tokenRow.user_id, url, title })
      .select('id')
      .single();
    if (insErr) throw insErr;

    await admin.from('user_api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenRow.id);

    logger.info(`queued pending link ${inserted.id} for user ${tokenRow.user_id}`);
    return new Response(JSON.stringify({ id: inserted.id }), {
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  } catch (e) {
    logger.error(`queue-pending-link error: ${(e as Error).message}`);
    return new Response(JSON.stringify({ error: 'server-error' }), {
      status: 500, headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: `deno.json`** mirrors siblings (`create-link/deno.json`).
- [ ] **Step 3: Smoke-test locally** via `curl -X POST -H 'x-f2a-token: <test>' -d '{"url":"https://example.com"}' http://localhost:54321/functions/v1/queue-pending-link`.
- [ ] **Step 4: Commit** — `feat(backend): queue-pending-link edge function`.

---

## Chunk 2: Desktop drain + UI

### Task 2.1: Token management IPC + Settings UI

**Files:**
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts` (new IPC handlers `list-api-tokens`, `create-api-token`, `revoke-api-token`)
- Modify: a renderer settings page under `apps/desktopProbe/src/components/` (find by grep `Settings`)

- [ ] **Step 1:** Generate token: `crypto.randomBytes(32).toString('base64url')`. Store only sha256 in DB; return raw to renderer once.
- [ ] **Step 2:** Settings UI: "iPhone Share" section. Button **Generate token**, shows raw token once with copy-to-clipboard + "Open Shortcut setup" link to the iCloud Shortcut URL placeholder.
- [ ] **Step 3:** Test the IPC handlers manually; revoke flow flips `revoked_at`.
- [ ] **Step 4:** Commit — `feat(desktop): personal API tokens for iPhone share`.

### Task 2.2: Pending-links drain in scan loop

**Files:**
- Modify: `libraries/scraper/src/jobScanner.ts` — add `drainPendingLinks()` method.
- Modify: `apps/desktopProbe/src/server/rendererIpcApi.ts` — call `drainPendingLinks()` immediately before/after each `scanLinks()` invocation.
- Add tests: `apps/desktopProbe/src/server/__tests__/jobScanner.test.ts` — new describe block.

- [ ] **Step 1: Failing test** for `drainPendingLinks`: given two pending rows, drain visits each URL, calls `createLink`, deletes row on success.
- [ ] **Step 2:** Implement `drainPendingLinks`:
  0. **Reap stuck claims first:** `update pending_links set status='pending', updated_at=now() where user_id=me and status='claimed' and updated_at < now() - interval '10 minutes'`. Recovers rows orphaned by a desktop crash mid-drain.
  1. Find candidates: `select id from pending_links where user_id=me and status='pending' and attempts < 3 order by created_at asc limit 5`.
  2. **Atomic claim** each: `update pending_links set status='claimed', attempts=attempts+1, updated_at=now() where id=$1 and status='pending' returning *`. Skip rows that return zero (another client already grabbed them).
  3. Open the URL in an offscreen BrowserView (re-use `overlayBrowserView.ts` helpers), wait for DOM-ready, extract `<title>` if row.title is null, capture `html` + `webPageRuntimeData`.
  4. Call existing `supabaseApi.createLink({ title, url, html, webPageRuntimeData, force: true, scanFrequency: 'daily' })`.
  5. On success: `delete from pending_links where id=row.id`.
  6. On failure:
     - If `attempts < 3` → `update ... set status='pending', error_message=<message>, updated_at=now()` (will be retried next drain cycle).
     - If `attempts >= 3` → `update ... set status='failed', error_message=<message>`.
- [ ] **Step 3: Failure-case test** — when `createLink` throws "site not supported", row ends up `status='failed'` with the message.
- [ ] **Step 4: Notification** — at the end of each drain cycle, if `terminalFailures > 0`, emit a single aggregated toast: `"${terminalFailures} shared link(s) failed — see dashboard"`. Never emit per-row toasts.
- [ ] **Step 5: Commit** — `feat(desktop): drain pending_links queue in scan loop`.

### Task 2.3: Dashboard panel "Pending from iPhone"

**Files:**
- Modify: dashboard view (locate via grep for the existing links list component).

- [ ] **Step 1:** New IPC `list-pending-links` returning rows where status in ('pending','failed') AND `created_at > now() - interval '14 days'`. Older failed rows are hidden (kept in DB for forensic value but out of UI).
- [ ] **Step 2:** Small panel on the links/dashboard page: shows URL, status badge, error_message if failed, and Retry/Delete buttons. Retry sets status back to 'pending'; Delete removes the row.
- [ ] **Step 3:** Commit — `feat(desktop): pending-from-iPhone panel on dashboard`.

---

## Chunk 3: iOS Shortcut + Docs

### Task 3.1: Build & export Shortcut

- [ ] **Step 1:** Build the Shortcut on iPhone with actions:
  1. Receive: Share Sheet → URLs
  2. Get Name of input → variable `Title`
  3. Get Contents of URL:
     - URL: `https://<project>.supabase.co/functions/v1/queue-pending-link`
     - Method: POST
     - Headers: `x-f2a-token: <pasted at setup>`, `Content-Type: application/json`
     - Request body (JSON): `{ "url": "<Shortcut input URL>", "title": "<Title>" }`
  4. If status ≠ 200 → Show Notification with the error key.
  5. Else → Show Notification "Queued for First2Apply".
- [ ] **Step 2:** Export to iCloud share link; record link in `docs/ios-shortcut-setup.md`.
- [ ] **Step 3:** Commit — `docs: iOS share-sheet shortcut setup`.

### Task 3.2: Setup doc

**Files:**
- Create: `docs/ios-shortcut-setup.md`

- [ ] One-page walkthrough: open Shortcut → install → paste token from desktop Settings → done. Screenshots optional.

---

## Acceptance Criteria

1. Share an `https://stripe.com/jobs` URL from iPhone Safari → row appears in dashboard "Pending" panel within 60 seconds; transitions to a real link if parsable, or `failed` with a clear error if not.
2. Revoking the token in Settings causes the Shortcut to fail with 401.
3. Posting the same URL twice while still pending is deduped (single row).
4. Queue is capped at 30 pending per user (HTTP 429).
5. No JWT lifetime issues — personal token never expires until revoked.
6. Existing scanner tests still pass.
