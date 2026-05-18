'use client';

import { useEffect, useState } from 'react';

export default function UnregisterPage() {
  const [status, setStatus] = useState<'working' | 'done' | 'unsupported'>('working');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } finally {
        setStatus('done');
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Resetting the app…</h1>
        {status === 'working' && <p className="text-muted-foreground mt-2 text-sm">Clearing cached data.</p>}
        {status === 'done' && (
          <>
            <p className="text-muted-foreground mt-2 text-sm">Done. The app has been reset.</p>
            <a href="/" className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm">
              Reload First 2 Apply
            </a>
          </>
        )}
        {status === 'unsupported' && (
          <p className="text-muted-foreground mt-2 text-sm">This browser does not support service workers.</p>
        )}
      </div>
    </main>
  );
}
