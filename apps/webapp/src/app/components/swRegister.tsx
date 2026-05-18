'use client';

import { useEffect } from 'react';

function beacon(event: string, extra: Record<string, unknown> = {}) {
  try {
    const payload = JSON.stringify({ event, ts: Date.now(), ...extra });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/sw-event', payload);
    }
    console.info('[sw]', event, extra);
  } catch {
    // best effort
  }
}

export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        beacon('registered');

        reg.addEventListener('updatefound', () => {
          beacon('updatefound');
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            beacon('statechange', { state: installing.state });
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          beacon('controllerchange');
        });

        navigator.serviceWorker.addEventListener('message', (e) => {
          if (e.data?.type === 'sw-activated') {
            beacon('activated', { version: e.data.version });
          }
        });
      } catch (err) {
        beacon('register-failed', { err: String(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
