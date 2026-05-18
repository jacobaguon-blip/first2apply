// queue-pending-link
// Auth: x-f2a-token header (sha256 → user_api_tokens.token_hash).
// Inserts a row into pending_links for the matching user. The desktop app
// drains the queue, opens each URL in an offscreen BrowserView, and routes
// through the normal create-link flow.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_PENDING_PER_USER = 30;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  const logger = createLoggerWithMeta({ function: 'queue-pending-link' });

  try {
    if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

    const token = req.headers.get('x-f2a-token');
    if (!token) return json({ error: 'missing-token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const hash = await sha256Hex(token);

    const { data: tokenRow, error: tokenErr } = await admin
      .from('user_api_tokens')
      .select('id, user_id, scopes, revoked_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (tokenErr) throw tokenErr;
    if (!tokenRow || tokenRow.revoked_at) return json({ error: 'invalid-token' }, 401);
    if (!tokenRow.scopes?.includes('queue-link')) return json({ error: 'insufficient-scope' }, 403);

    const body = (await req.json().catch(() => ({}))) as { url?: string; title?: string };
    const url = (body.url ?? '').trim();
    if (!/^https?:\/\//i.test(url) || url.length > 2048) return json({ error: 'invalid-url' }, 400);
    const title = (body.title ?? '').slice(0, 256) || null;

    const { count } = await admin
      .from('pending_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', tokenRow.user_id)
      .eq('status', 'pending');

    if ((count ?? 0) >= MAX_PENDING_PER_USER) return json({ error: 'queue-full' }, 429);

    const { data: existing } = await admin
      .from('pending_links')
      .select('id')
      .eq('user_id', tokenRow.user_id)
      .eq('url', url)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) return json({ id: existing.id, deduped: true });

    const { data: inserted, error: insErr } = await admin
      .from('pending_links')
      .insert({ user_id: tokenRow.user_id, url, title })
      .select('id')
      .single();
    if (insErr) throw insErr;

    await admin
      .from('user_api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    logger.info(`queued pending link ${inserted.id} for user ${tokenRow.user_id}`);
    return json({ id: inserted.id });
  } catch (e) {
    logger.error(`queue-pending-link error: ${(e as Error).message}`);
    return json({ error: 'server-error' }, 500);
  }
});
