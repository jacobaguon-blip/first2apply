/**
 * Minimal self-hosted router for the first2apply edge functions, run on the Pi
 * so all AI parsing happens locally against Ollama (no API key, no 429s).
 *
 * Mounts each function's exported `handle(req)` under `/functions/v1/<name>`.
 * The probe's supabase-js client is configured to rewrite cloud function URLs
 * to this router via a custom `global.fetch`.
 *
 * Auth is handled by the original `getEdgeFunctionContext` path inside each
 * handler — the probe passes its service-role key just as it does when calling
 * cloud Supabase, and the same logic resolves user/auth context.
 *
 * `post-scan-hook` is intentionally a no-op locally: it sends email
 * notifications which we don't want from a self-hosted parse server.
 */
import { handle as scanUrlsHandle } from './scan-urls/index.ts';
import { handle as scanJobDescriptionHandle } from './scan-job-description/index.ts';
import { handle as evaluateJobHandle } from './evaluate-job/index.ts';
import { handle as tailorCvHandle } from './tailor-cv/index.ts';
import { handle as parseCvHandle } from './parse-cv/index.ts';
import { handle as reapplyFilterProfileHandle } from './reapply-filter-profile/index.ts';
import { CORS_HEADERS } from './_shared/cors.ts';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });

const port = Number(Deno.env.get('F2A_LOCAL_FN_PORT') ?? '54321');

// Defense-in-depth router auth. Handlers each enforce real auth via
// getEdgeFunctionContext (Supabase JWT / service-role validation); this gate
// just blocks unauthenticated requests from reaching the handlers at all.
// Accepts ANY non-empty Bearer token — the legitimate callers send a Supabase
// JWT, the service-role key, or F2A_PROBE_SECRET; the handlers validate the
// real token below. `/health` and OPTIONS are intentionally exempt so smoke
// tests and CORS preflights don't need credentials.
const isAuthorized = (req: Request): boolean => {
  const auth = req.headers.get('Authorization') ?? '';
  return /^Bearer\s+\S+/.test(auth);
};

console.log(`[local-fn] starting on :${port} (provider=${Deno.env.get('F2A_AI_PROVIDER') ?? 'local'}, ollama=${Deno.env.get('F2A_OLLAMA_URL') ?? '(default)'}, model=${Deno.env.get('F2A_OLLAMA_MODEL') ?? '(default)'}, bind=0.0.0.0)`);

// Bind to all interfaces so the desktop (over Tailscale → tailscale0) and the
// host-networked probe (loopback) both reach us. The router's bearer gate +
// the per-handler getEdgeFunctionContext checks are what actually authorize
// callers — not the bind. Don't change to 0.0.0.0 without ensuring isAuthorized
// is in place, or LAN/Tailscale peers gain unauthenticated reach.
Deno.serve({ port, hostname: '0.0.0.0' }, async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  // Strip the `/functions/v1/` prefix supabase-js prepends, then route by name.
  const m = url.pathname.match(/^\/functions\/v1\/([^\/]+)/);
  const fnName = m?.[1] ?? '';

  // Health is the only unauthenticated endpoint (smoke tests + readiness checks).
  if (fnName !== 'health' && !isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'missing or invalid Authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  switch (fnName) {
    case 'scan-urls':
      return scanUrlsHandle(req);
    case 'scan-job-description':
      return scanJobDescriptionHandle(req);
    case 'evaluate-job':
      return evaluateJobHandle(req);
    case 'tailor-cv':
      return tailorCvHandle(req);
    case 'parse-cv':
      return parseCvHandle(req);
    case 'reapply-filter-profile':
      return reapplyFilterProfileHandle(req);
    case 'post-scan-hook':
      // intentional local no-op (no emails, no cloud webhook fan-out)
      return ok({ ok: true, skipped: true });
    case 'health':
      return ok({ ok: true });
    default:
      console.log(`[local-fn] 404 unknown function: ${fnName} (${url.pathname})`);
      return ok({ error: `function not found: ${fnName}` }, 404);
  }
});
