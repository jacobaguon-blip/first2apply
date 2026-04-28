import http from 'node:http';

export type HealthServerOptions = {
  port?: number;
  host?: string;
  getLastScanAt: () => Date | undefined;
  getCronIntervalMs: () => number;
};

export type HealthServerHandle = {
  close: () => Promise<void>;
};

const BOOTSTRAP_GRACE_CAP_MS = 10 * 60 * 1000;

export function startHealthServer(opts: HealthServerOptions): HealthServerHandle {
  const port = opts.port ?? 7878;
  const host = opts.host ?? '127.0.0.1';
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/healthz') {
      res.statusCode = 404;
      res.end();
      return;
    }

    const cronMs = Math.max(opts.getCronIntervalMs(), 60_000);
    const graceMs = Math.min(2 * cronMs, BOOTSTRAP_GRACE_CAP_MS);
    const lastScanAt = opts.getLastScanAt();
    const now = Date.now();

    const inBootstrapGrace = now - startedAt < graceMs;
    const fresh = lastScanAt ? now - lastScanAt.getTime() < 2 * cronMs : false;

    if (inBootstrapGrace || fresh) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', lastScanAt: lastScanAt?.toISOString() ?? null }));
      return;
    }

    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'stale', lastScanAt: lastScanAt?.toISOString() ?? null }));
  });

  server.on('error', (err) => {
    console.error(`[healthServer] listen error: ${(err as Error).message}`);
  });
  server.listen(port, host);

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
