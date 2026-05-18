// Lightweight 401 surface for PWA (plan §4.9).
// Wraps fetch so server actions / supabase REST that return 401 emit a custom
// event the UI can listen to; avoids opaque redirects when offline.

const EVT = 'f2a:session-expired';

let installed = false;

export function installAuthInterceptor() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await originalFetch(input, init);
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent(EVT));
    }
    return res;
  };
}

export function onSessionExpired(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
