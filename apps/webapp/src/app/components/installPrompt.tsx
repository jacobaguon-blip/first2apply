'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'f2a:install-prompt-dismissed-v1';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports as Mac with touch
  if (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document) return true;
  return false;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  // Other browsers
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // ignore
    }
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install First 2 Apply"
      className="bg-card text-card-foreground fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <p className="font-medium">Install First 2 Apply</p>
          <p className="text-muted-foreground mt-1">
            Tap the <span aria-label="Share">Share</span> button, then <span className="font-medium">Add to Home Screen</span> to use the app
            offline.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="text-muted-foreground text-xs underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
