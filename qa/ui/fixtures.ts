import { Browser, Page, chromium } from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { CdpProxy, startCdpFilterProxy } from './cdpFilterProxy';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_APP = path.join(
  REPO_ROOT,
  'apps/desktopProbe/out/First 2 Apply-darwin-arm64/First 2 Apply.app/Contents/MacOS/First 2 Apply',
);

/** Path of the packaged app binary. Override with F2A_QA_APP_BINARY. */
export function appBinary(): string {
  return process.env.F2A_QA_APP_BINARY ?? DEFAULT_APP;
}

export function appBinaryExists(): boolean {
  return fs.existsSync(appBinary());
}

export const hasCreds = Boolean(process.env.F2A_QA_EMAIL && process.env.F2A_QA_PASSWORD);

export function screenshotDir(): string {
  const dir = process.env.F2A_QA_REPORT_DIR ?? path.join(REPO_ROOT, 'qa', 'reports', 'adhoc');
  const shots = path.join(dir, 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  return shots;
}

export interface LaunchedApp {
  browser: Browser;
  page: Page;
  userDataDir: string;
  consoleErrors: string[];
  pageErrors: string[];
  close: () => Promise<void>;
}

/** Wait for Electron to print its browser-level DevTools websocket on stderr. */
function waitForDevtoolsUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`app did not print a DevTools URL in ${timeoutMs}ms. stderr: ${buf.slice(-500)}`)), timeoutMs);
    proc.stderr?.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited early with code ${code}. stderr: ${buf.slice(-500)}`));
    });
  });
}

/**
 * Launch the packaged app with a throwaway user-data-dir so the real app data, session and
 * single-instance lock are never touched.
 *
 * Why not `_electron.launch`: see cdpFilterProxy.ts and docs/QA.md. In short, Playwright hangs
 * while attaching to the app's hidden helper pages, so we start the binary ourselves, hide those
 * pages behind a small CDP proxy, and attach with `chromium.connectOverCDP`.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2a-qa-'));
  const proc = spawn(appBinary(), [`--user-data-dir=${userDataDir}`, '--remote-debugging-port=0'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, F2A_PAUSE_SCANS: '1' },
  });
  let proxy: CdpProxy | undefined;
  let browser: Browser | undefined;
  const close = async () => {
    await browser?.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
    // The app's quit handler can hang when the backend is unreachable, so do not wait on it.
    proc.kill('SIGKILL');
    // Best effort: the killed app may still be flushing files into the temp dir.
    await new Promise((r) => setTimeout(r, 300));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* temp dir is cleaned by the OS eventually */
    }
  };
  try {
    const upstream = await waitForDevtoolsUrl(proc, 45_000);
    proxy = await startCdpFilterProxy({
      upstream,
      keepTarget: (info) => info.url.includes('index.html') || info.url.startsWith('file://'),
    });
    browser = await chromium.connectOverCDP(proxy.url, { timeout: 30_000 });
    const context = browser.contexts()[0];
    const page = context.pages().find((p) => p.url().includes('index.html')) ?? (await context.waitForEvent('page'));

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    // Reload so listeners observe the full first load of the renderer.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    return { browser, page, userDataDir, consoleErrors, pageErrors, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Save a screenshot of the app window. Playwright's own screenshot can stall on a backgrounded
 * Electron window, so fall back to a raw CDP capture (which does not wait for a new frame).
 * Returns the written path.
 */
export async function shot(page: Page, name: string): Promise<string> {
  const file = path.join(screenshotDir(), `${name}.png`);
  await page.bringToFront().catch(() => undefined);
  try {
    await page.screenshot({ path: file, timeout: 8_000, animations: 'disabled' });
  } catch {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    await cdp.detach().catch(() => undefined);
  }
  return file;
}

/**
 * Console errors that are environmental noise, not renderer bugs. The QA build points at a
 * placeholder backend (nothing listens on it), so network failures are expected.
 */
export function relevantErrors(errors: string[]): string[] {
  const noise = [/net::ERR_/, /Failed to load resource/, /ECONNREFUSED/, /fetch failed/i, /ERR_NAME_NOT_RESOLVED/];
  return errors.filter((e) => !noise.some((re) => re.test(e)));
}
