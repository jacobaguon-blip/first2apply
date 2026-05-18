'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function OfflineGate({ children, hint = "You're offline — reconnect to continue." }: { children: ReactNode; hint?: string }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (online) return <>{children}</>;

  return (
    <div className="relative" aria-disabled="true">
      <div className="pointer-events-none opacity-50">{children}</div>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}
