/**
 * fetch wrapper for the local LLM client (the Codex shim on the Pi).
 *
 * A request that lands while the shim restarts (a deploy or a crash loop) fails with a
 * connection error, which would be recorded as a failed scan. Network-level failures
 * are retried until the shim answers or maxWaitMs passes. HTTP error statuses are NOT retried
 * and an aborted request (the caller's own timeout) is never retried.
 */
export function buildResilientFetch({
  maxWaitMs = 90_000,
  intervalMs = 3_000,
  fetchImpl = fetch,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  onRetry,
}: {
  maxWaitMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; waitedMs: number; error: unknown }) => void;
} = {}): typeof fetch {
  return async (input, init) => {
    let waitedMs = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchImpl(input, init);
      } catch (error) {
        if (init?.signal?.aborted || waitedMs + intervalMs > maxWaitMs) throw error;
        onRetry?.({ attempt, waitedMs, error });
        await sleep(intervalMs);
        waitedMs += intervalMs;
      }
    }
  };
}
