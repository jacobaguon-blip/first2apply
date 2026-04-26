/**
 * Pushover notification helper.
 *
 * Backlog item 3. See docs/pushover-audit.md.
 *
 * - Mock transport when F2A_PUSHOVER_MOCK=1 (dev / CI).
 * - Exponential backoff with jitter on transient failures (network or 5xx).
 * - 429 respect: honors `Retry-After` header (seconds), capped.
 * - Public API (sendPushover) unchanged from previous version so the single
 *   existing call site needs no edits.
 */

export type SendPushoverOpts = {
  appToken: string;
  userKey: string;
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
};

export type PushoverTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; headers: { get: (k: string) => string | null } }>;

export type SendPushoverConfig = {
  /** Override transport (testing). Defaults to global fetch. */
  transport?: PushoverTransport;
  /** Override env (testing). Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Max attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff ms. Default 500. */
  baseDelayMs?: number;
  /** Max Retry-After seconds we will honor. Default 60. */
  maxRetryAfterS?: number;
  /** Sleep injection (testing). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Log injection. Default console. */
  log?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
};

const ENDPOINT = 'https://api.pushover.net/1/messages.json';
const DEFAULT_LOG = {
  info: (m: string) => console.info(`[pushover] ${m}`),
  warn: (m: string) => console.warn(`[pushover] ${m}`),
  error: (m: string) => console.error(`[pushover] ${m}`),
};

function realSleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  // ±25%
  const delta = ms * 0.25;
  return ms - delta + Math.random() * (2 * delta);
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function parseRetryAfterSeconds(headerVal: string | null, capS: number): number | null {
  if (!headerVal) return null;
  const n = parseInt(headerVal, 10);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, capS);
  // RFC date form is also possible; ignore — we'll fall back to backoff.
  return null;
}

export async function sendPushover(opts: SendPushoverOpts, config: SendPushoverConfig = {}): Promise<void> {
  const env = config.env ?? (typeof process !== 'undefined' ? process.env : {});
  const log = config.log ?? DEFAULT_LOG;

  // Mock transport for dev / CI / tests.
  if (env.F2A_PUSHOVER_MOCK === '1') {
    log.info(`MOCK send: title="${opts.title}" message="${opts.message.slice(0, 80)}"`);
    return;
  }

  const transport = config.transport ?? ((url, init) => fetch(url, init) as unknown as ReturnType<PushoverTransport>);
  const maxAttempts = config.maxAttempts ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 500;
  const maxRetryAfterS = config.maxRetryAfterS ?? 60;
  const sleep = config.sleep ?? realSleep;

  const params = new URLSearchParams({
    token: opts.appToken,
    user: opts.userKey,
    title: opts.title,
    message: opts.message,
    ...(opts.url ? { url: opts.url, url_title: opts.urlTitle ?? 'Open' } : {}),
  });

  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await transport(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (response.ok) {
        return;
      }

      const body = await response.text().catch(() => '');

      if (isRetriableStatus(response.status) && attempt < maxAttempts) {
        const retryAfter = parseRetryAfterSeconds(response.headers.get('Retry-After'), maxRetryAfterS);
        const delay = retryAfter != null ? retryAfter * 1000 : jitter(baseDelayMs * 2 ** (attempt - 1));
        log.warn(
          `attempt ${attempt}/${maxAttempts} got ${response.status}; retrying in ${Math.round(delay)}ms (Retry-After=${retryAfter ?? 'n/a'})`,
        );
        await sleep(delay);
        continue;
      }

      // Non-retriable, or out of attempts.
      throw new Error(`Pushover API ${response.status}: ${body}`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // If the error came from the throw above (status-based), it's already final-ish.
      // For network-level errors, retry.
      const isNetworkErr = !(lastErr.message.startsWith('Pushover API '));
      if (isNetworkErr && attempt < maxAttempts) {
        const delay = jitter(baseDelayMs * 2 ** (attempt - 1));
        log.warn(`attempt ${attempt}/${maxAttempts} network err: ${lastErr.message}; retrying in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }
      throw lastErr;
    }
  }

  // Defensive — loop exit only via return or throw above.
  throw lastErr ?? new Error('Pushover: exhausted retries');
}
