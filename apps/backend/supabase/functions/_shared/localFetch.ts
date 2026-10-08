/**
 * fetch wrapper for the local Ollama client.
 *
 * On the Pi, ollama-on-demand.timer stops Ollama after 5 idle minutes and starts it again
 * (within about 30s) once the edge runtime is up. A request that lands in that window fails
 * with a connection error, which used to be recorded as a failed scan. Network-level failures
 * are retried until Ollama answers or maxWaitMs passes. HTTP error statuses are NOT retried
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
