/**
 * Tailscale-scoped HTTP control surface for the probe.
 *
 * Lets the desktop app trigger an immediate Pi-side scan instead of running
 * the scraper on the user's laptop. Auth is a shared bearer secret
 * (F2A_PROBE_SECRET). The container only port-maps this on the Tailscale
 * interface, so it's not reachable from LAN or WAN.
 *
 * Endpoints:
 *   POST /scan/link/:id        → scan one link, gate-bypassing
 *   POST /scan/user/:userId    → scan all of one user's links, gate-bypassing
 *   GET  /status               → { isScanning, lastScanAt, queueDepth }
 */
import http from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobScanner } from '@first2apply/scraper';

export type ControlServerOptions = {
  port?: number;
  host?: string;
  authSecret: string;
  scanner: JobScanner;
  supabase: SupabaseClient;
  getLastScanAt: () => Date | undefined;
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
};

export type ControlServerHandle = {
  close: () => Promise<void>;
  port: number;
};

export function startControlServer(opts: ControlServerOptions): ControlServerHandle {
  const port = opts.port ?? 7879;
  const host = opts.host ?? '0.0.0.0';
  const { authSecret, scanner, supabase, getLastScanAt, logger } = opts;

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const authOk = (req: http.IncomingMessage) => {
    const h = req.headers['authorization'];
    if (typeof h !== 'string') return false;
    if (!h.startsWith('Bearer ')) return false;
    return h.slice(7) === authSecret;
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/status') {
        if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
        return json(res, 200, {
          isScanning: scanner.isScanning(),
          lastScanAt: getLastScanAt()?.toISOString() ?? null,
        });
      }

      const linkMatch = req.url?.match(/^\/scan\/link\/(\d+)$/);
      if (req.method === 'POST' && linkMatch) {
        if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
        const linkId = Number(linkMatch[1]);
        logger.info('control: scan request', { linkId, source: 'http' });
        // Fire-and-forget; scanner queues via its internal state.
        scanner.scanLink({ linkId }).catch((err) => {
          logger.error(`control: scanLink failed: ${(err as Error).message}`, { linkId });
        });
        return json(res, 202, { accepted: true, linkId });
      }

      const userMatch = req.url?.match(/^\/scan\/user\/([0-9a-f-]{36})$/i);
      if (req.method === 'POST' && userMatch) {
        if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
        const userId = userMatch[1];
        const { data, error } = await supabase
          .from('links')
          .select('*')
          .eq('user_id', userId);
        if (error) {
          logger.error(`control: list user links failed: ${error.message}`, { userId });
          return json(res, 500, { error: error.message });
        }
        const links = data ?? [];
        logger.info('control: scan request (user)', { userId, source: 'http', count: links.length });
        scanner.scanLinks({ links: links as never }).catch((err) => {
          logger.error(`control: scanLinks failed: ${(err as Error).message}`, { userId });
        });
        return json(res, 202, { accepted: true, userId, count: links.length });
      }

      json(res, 404, { error: 'not found' });
    } catch (err) {
      logger.error(`control: unexpected error: ${(err as Error).message}`);
      json(res, 500, { error: 'internal error' });
    }
  });

  server.on('error', (err) => {
    logger.error(`controlServer listen error: ${(err as Error).message}`);
  });
  server.listen(port, host);

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
