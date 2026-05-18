import { BrowserWindow } from 'electron';

import { HtmlFetcher } from './index';

export function makeSingleShotFetcher(timeoutMs = 8000): HtmlFetcher {
  return {
    fetchRenderedHtml: (url: string) => fetchRenderedHtmlWithTimeout(url, timeoutMs),
  };
}

async function fetchRenderedHtmlWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: true, nodeIntegration: false, contextIsolation: true },
  });
  const destroy = () => {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {
      /* already destroyed */
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      await win.loadURL(url);
      await new Promise((r) => setTimeout(r, 1500));
      return (await win.webContents.executeJavaScript('document.documentElement.innerHTML')) as string;
    })();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        destroy();
        reject(new Error(`probe timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    destroy();
  }
}
