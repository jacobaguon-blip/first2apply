/**
 * apps/serverProbe — Electron-main headless probe that runs under Xvfb in
 * Docker on the Pi. Same scraper code path as desktopProbe; runtime concerns
 * (logging, settings, no-UI) are wired via server-side adapters.
 *
 * --------------------------------------------------------------------------
 * CRITICAL ORDERING — Chromium sandbox:
 *   `app.commandLine.appendSwitch('no-sandbox')` MUST be called BEFORE
 *   `app.whenReady()`. If invoked after, the flag is silently ignored,
 *   Chromium fails sandbox setup, and the container can't render.
 *   Tested via `--selftest` mode.
 *
 *   See docs/plans/2026-04-27-server-probe-design.md §4.3 for the rationale
 *   and residual-risk discussion of running with the sandbox disabled.
 * --------------------------------------------------------------------------
 */
import { app } from 'electron';

// CRITICAL: must run before app.whenReady(). Do not move.
app.commandLine.appendSwitch('no-sandbox');

import { createClient } from '@supabase/supabase-js';
import { JobScanner, startHealthServer } from '@first2apply/scraper';

import { validateEnv } from './env';
import { ConsoleLogger, EnvSettingsProvider, NoopAnalytics } from './adapters';
import { HiddenWindowDownloader } from './htmlDownloader';
import { ServerSupabaseApi } from './supabaseApi';

type CliMode = 'selftest' | 'dry-run' | 'scan-once' | 'serve';

type CliArgs = {
  mode: CliMode;
  legacyMockScrape: boolean;
  deprecatedProbeOnce: boolean;
};

const KNOWN_FLAGS = new Set(['--selftest', '--dry-run', '--scan-once', '--probe-once']);

function parseArgs(argv: string[]): CliArgs {
  for (const a of argv) {
    if (a.startsWith('--') && !KNOWN_FLAGS.has(a)) {
      console.error(`[serverProbe] unknown flag: ${a}\nKnown flags: ${[...KNOWN_FLAGS].join(', ')}`);
      process.exit(2);
    }
  }
  const has = (f: string) => argv.includes(f);
  const legacyMockScrape = process.env.F2A_MOCK_SCRAPE === '1';
  const deprecatedProbeOnce = has('--probe-once');

  let mode: CliMode = 'serve';
  if (has('--selftest')) mode = 'selftest';
  else if (has('--dry-run') || legacyMockScrape) mode = 'dry-run';
  else if (has('--scan-once') || deprecatedProbeOnce) mode = 'scan-once';

  return { mode, legacyMockScrape, deprecatedProbeOnce };
}

async function waitForScansToFinish(scanner: JobScanner, timeoutMs = 30_000) {
  const start = Date.now();
  while (scanner.isScanning() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
  }
}

function cronToIntervalMs(cronRule: string): number {
  // Crude approximation — only used for health server bootstrap-grace timing.
  // Recognizes the seven values from AVAILABLE_CRON_RULES.
  const map: Record<string, number> = {
    '*/30 * * * *': 30 * 60_000,
    '0 * * * *': 60 * 60_000,
    '0 */2 * * *': 2 * 60 * 60_000,
    '0 */4 * * *': 4 * 60 * 60_000,
    '0 */8 * * *': 8 * 60 * 60_000,
    '0 */12 * * *': 12 * 60 * 60_000,
    '0 0 * * *': 24 * 60 * 60_000,
  };
  return map[cronRule] ?? 60 * 60_000;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.legacyMockScrape) {
    console.warn('F2A_MOCK_SCRAPE is deprecated; use --dry-run flag');
  }
  if (args.deprecatedProbeOnce) {
    console.warn('--probe-once is deprecated; use --scan-once');
  }

  // --selftest exits early without touching env / network
  if (args.mode === 'selftest') {
    await app.whenReady();
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'selftest: Electron ready' }));
    app.exit(0);
    return;
  }

  const env = validateEnv()!;
  const logger = new ConsoleLogger({ logFile: env.logFile });
  logger.info(`serverProbe starting`, { mode: args.mode, tz: env.tz ?? 'UTC' });

  await app.whenReady();

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const supabaseApi = new ServerSupabaseApi(supabase);
  const settingsProvider = new EnvSettingsProvider(logger, env);
  const analytics = new NoopAnalytics();

  const normal = new HiddenWindowDownloader({ logger, numInstances: 2, incognitoMode: false });
  const incognito = new HiddenWindowDownloader({ logger, numInstances: 1, incognitoMode: true });
  normal.init();
  incognito.init();

  let lastScanAt: Date | undefined;
  const dryRun = args.mode === 'dry-run';

  const scanner = new JobScanner({
    logger,
    supabaseApi,
    normalHtmlDownloader: normal,
    incognitoHtmlDownloader: incognito,
    onNavigate: () => {},
    analytics,
    settingsProvider,
    pushoverEnv: { appToken: env.pushoverAppToken, userKey: env.pushoverUserKey },
    dryRun,
    onScanComplete: () => {
      lastScanAt = new Date();
    },
  });

  if (args.mode === 'dry-run' || args.mode === 'scan-once') {
    const hardExit = setTimeout(() => {
      logger.error('one-shot exit timeout reached, forcing exit');
      process.exit(1);
    }, 60_000);
    hardExit.unref();
    try {
      await scanner.scanAllLinks();
      logger.info(`one-shot ${args.mode} complete`);
    } catch (err) {
      logger.error(`one-shot ${args.mode} failed: ${(err as Error).message}`);
    } finally {
      scanner.close();
      await waitForScansToFinish(scanner);
      await Promise.all([normal.close(), incognito.close()]);
      clearTimeout(hardExit);
      app.exit(0);
    }
    return;
  }

  // Default: long-running serve mode
  const cronMs = cronToIntervalMs(env.cronRule);
  const health = startHealthServer({
    getLastScanAt: () => lastScanAt,
    getCronIntervalMs: () => cronMs,
  });
  logger.info('health server listening on http://127.0.0.1:7878/healthz');

  const shutdown = async (sig: string) => {
    logger.info(`received ${sig}, shutting down`);
    scanner.close();
    await waitForScansToFinish(scanner);
    await health.close().catch(() => {});
    await Promise.all([normal.close(), incognito.close()]);
    app.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`[serverProbe] fatal: ${(err as Error).stack ?? err}`);
  process.exit(1);
});
