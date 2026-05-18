/// <reference lib="webworker" />
// Service worker entry, compiled by @serwist/next.
// Plan §4.2, §4.7 — strict caching boundaries + three-layer kill switch.

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkOnly, NetworkFirst, CacheFirst, ExpirationPlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Layer 2 kill switch: flip to true, build, deploy — installed clients self-unregister.
const KILL_SW = false;

// Bumped per release so we can identify versions in beacons.
const SW_VERSION = '1.0.0';

const networkOnly = new NetworkOnly();

const isRscRequest = (url: URL, req: Request) =>
  url.searchParams.has('_rsc') || req.headers.get('RSC') !== null || req.headers.get('Next-Router-State-Tree') !== null;

const isAuthedApiRequest = (url: URL, req: Request) => {
  if (req.headers.get('Authorization')) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return true;
  return false;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache RSC payloads (plan H5)
    {
      matcher: ({ url, request }) => isRscRequest(url, request),
      handler: networkOnly,
    },
    // Never cache anything authenticated (plan C1)
    {
      matcher: ({ url, request }) => isAuthedApiRequest(url, request),
      handler: networkOnly,
    },
    // Static HTML navigations: NetworkFirst with offline fallback
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 3,
      }),
    },
    // Images: CacheFirst with LRU bound
    {
      matcher: ({ request }) => request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'images',
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Serwist default (precache + static asset rules)
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// Layer 1 kill switch: ?nosw=1 forces unregister on next request.
self.addEventListener('fetch', (event: FetchEvent) => {
  try {
    const url = new URL(event.request.url);
    if (url.searchParams.get('nosw') === '1') {
      event.waitUntil(unregisterAndReload());
    }
  } catch {
    // ignore malformed URLs
  }
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  if (KILL_SW) {
    event.waitUntil(unregisterAndReload());
    return;
  }
  // Beacon (best effort)
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        c.postMessage({ type: 'sw-activated', version: SW_VERSION });
      }
    })(),
  );
});

async function unregisterAndReload() {
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      c.navigate(c.url);
    }
  } catch {
    // best effort
  }
}
