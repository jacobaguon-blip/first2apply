import http from 'http';
import { AddressInfo } from 'net';
import WebSocket, { WebSocketServer } from 'ws';

/**
 * Why this exists: the packaged app creates hidden helper pages (HTML downloaders, in their own
 * Electron partitions). Playwright auto-attaches to every page target and waits for each one to
 * answer Page.enable, but those hidden pages never answer, so both `_electron.launch` and
 * `chromium.connectOverCDP` hang forever. This proxy sits between Playwright and the app's
 * browser-level DevTools socket and hides every page target that is not the app window.
 *
 * It forwards everything else untouched.
 */
export interface CdpProxy {
  /** ws:// URL Playwright should connect to. */
  url: string;
  close: () => Promise<void>;
}

export interface ProxyOptions {
  /** Upstream browser websocket, e.g. ws://127.0.0.1:9222/devtools/browser/<id>. */
  upstream: string;
  /** Return true when a page target should be visible to Playwright. */
  keepTarget: (info: { type: string; url: string; title: string }) => boolean;
}

export async function startCdpFilterProxy({ upstream, keepTarget }: ProxyOptions): Promise<CdpProxy> {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  const hiddenSessions = new Set<string>();

  wss.on('connection', (client) => {
    const up = new WebSocket(upstream, { perMessageDeflate: false });
    const pending: WebSocket.RawData[] = [];

    client.on('message', (data) => {
      // Drop any command aimed at a hidden session. Playwright never learns about them, so this is
      // belt and braces.
      try {
        const msg = JSON.parse(data.toString());
        if (msg.sessionId && hiddenSessions.has(msg.sessionId)) return;
      } catch {
        /* forward as is */
      }
      if (up.readyState === WebSocket.OPEN) up.send(data.toString());
      else pending.push(data);
    });
    up.on('open', () => {
      for (const d of pending) up.send(d.toString());
      pending.length = 0;
    });
    up.on('message', (data) => {
      const text = data.toString();
      try {
        const msg = JSON.parse(text);
        if (msg.method === 'Target.attachedToTarget') {
          const info = msg.params?.targetInfo;
          if (info?.type === 'page' && !keepTarget(info)) {
            hiddenSessions.add(msg.params.sessionId);
            return;
          }
        }
        if (msg.sessionId && hiddenSessions.has(msg.sessionId)) return;
      } catch {
        /* forward as is */
      }
      if (client.readyState === WebSocket.OPEN) client.send(text);
    });
    const closeBoth = () => {
      client.close();
      up.close();
    };
    client.on('close', closeBoth);
    up.on('close', closeBoth);
    up.on('error', closeBoth);
    client.on('error', closeBoth);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        wss.clients.forEach((c) => c.terminate());
        wss.close(() => server.close(() => resolve()));
      }),
  };
}
