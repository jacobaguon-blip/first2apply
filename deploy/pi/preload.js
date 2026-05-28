/**
 * Node preload (NODE_OPTIONS=--require=/preload.js) injected into the
 * f2a-server-probe container so the running image — which was built BEFORE
 * the F2A_FUNCTIONS_URL probe-side wiring landed — gets the same rewriting
 * fetch without a rebuild.
 *
 * When F2A_FUNCTIONS_URL is set, this monkey-patches globalThis.fetch so any
 * outgoing call to ${SUPABASE_URL}/functions/v1/* is rewritten to
 * ${F2A_FUNCTIONS_URL}/functions/v1/*. DB/RPC/auth traffic (other paths)
 * passes through untouched and continues to cloud Supabase.
 *
 * Once the probe image is rebuilt with the in-source rewriting fetch (see
 * apps/serverProbe/src/main.ts), this preload becomes redundant and can be
 * removed by dropping the NODE_OPTIONS env var.
 */
const functionsUrl = process.env.F2A_FUNCTIONS_URL;
const supabaseUrl = process.env.SUPABASE_URL;
if (functionsUrl && supabaseUrl) {
  const prefix = supabaseUrl.replace(/\/$/, '') + '/functions/v1/';
  const localBase = functionsUrl.replace(/\/$/, '') + '/functions/v1/';
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function patchedFetch(input, init) {
    const rewrite = (raw) => (raw.startsWith(prefix) ? localBase + raw.slice(prefix.length) : raw);
    if (typeof input === 'string') return realFetch(rewrite(input), init);
    if (input instanceof URL) return realFetch(rewrite(input.toString()), init);
    if (input && typeof input === 'object' && 'url' in input) {
      const rewritten = rewrite(input.url);
      if (rewritten === input.url) return realFetch(input, init);
      return realFetch(new Request(rewritten, input), init);
    }
    return realFetch(input, init);
  };
  // eslint-disable-next-line no-console
  console.log(`[preload] rewriting fetch: ${prefix}* -> ${localBase}*`);
}
