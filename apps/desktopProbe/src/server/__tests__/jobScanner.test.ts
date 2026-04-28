import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Link } from '@first2apply/core';

// JobScanner imports `electron` at module load (Notification, app, powerSaveBlocker).
// `Notification` must be `new`-able; vi.fn().mockImplementation isn't a real
// constructor, so we use a plain function class.
vi.mock('electron', () => {
  class NotificationMock {
    on = vi.fn();
    show = vi.fn();
    constructor(_opts?: unknown) {}
  }
  return {
    Notification: NotificationMock,
    app: {
      getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
    },
    powerSaveBlocker: {
      start: vi.fn().mockReturnValue(0),
      stop: vi.fn(),
    },
  };
});

// browserHelpers.installLinkedInDecorator is called by the JobScanner
// constructor and accesses Electron Session APIs. Stub it.
vi.mock('../browserHelpers', () => ({
  installLinkedInDecorator: vi.fn(),
}));

// dispatchPushoverSummary is the network-side notifier. Mock so tests don't
// fire real Pushover, and so we can assert it was called with the right shape.
vi.mock('../notifications/dispatch', () => ({
  dispatchPushoverSummary: vi.fn().mockResolvedValue({ kind: 'sent' }),
}));

// ENV reads from process.env at module load. If PUSHOVER_APP_TOKEN is set in
// the parent shell, ENV.pushover.appToken wins over scanner settings (per
// jobScanner.ts:412-414). Mock ENV so settings are the source of truth in tests.
vi.mock('../../env', () => ({
  ENV: {
    nodeEnv: 'test',
    appBundleId: undefined,
    supabase: { url: undefined, key: undefined },
    mezmoApiKey: undefined,
    amplitudeApiKey: undefined,
    pushover: { appToken: undefined, userKey: undefined },
    pauseScans: false,
  },
}));

// Stub fs so the constructor doesn't read/write settings.json off real disk.
// jobScanner.ts uses `import fs from 'fs'` (default import) AND named imports
// transitively, so we mock both default + named.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const stubs = {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return {
    ...actual,
    ...stubs,
    default: { ...actual, ...stubs },
  };
});

// Imports below this line resolve through the mocks above.
import { JobScanner } from '../jobScanner';
import { dispatchPushoverSummary } from '../notifications/dispatch';

function makeMocks() {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const supabaseApi = {
    listLinks: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue({ jobs: [], hasMore: false, nextPageToken: null }),
    runPostScanHook: vi.fn().mockResolvedValue(undefined),
    scanHtmls: vi.fn().mockResolvedValue({ newJobs: [], parseFailed: false }),
    scanJobDescription: vi.fn(),
    listSites: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue({ user: null }),
    getSupabaseClient: vi.fn().mockReturnValue({ /* placeholder for assertion */ }),
  };
  const normalHtmlDownloader = {
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const incognitoHtmlDownloader = {
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const analytics = { trackEvent: vi.fn() };
  // The shape passed to JobScanner constructor (verified against
  // apps/desktopProbe/src/server/jobScanner.ts:58 in Task 0).
  return {
    logger,
    supabaseApi,
    normalHtmlDownloader,
    incognitoHtmlDownloader,
    analytics,
    onNavigate: vi.fn(),
  };
}

describe('JobScanner', () => {
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = makeMocks();
  });

  it('scanLinks: happy path calls downloader, scanHtmls, postScanHook in order', async () => {
    const links: Link[] = [
      {
        id: 1, url: 'https://example.com/jobs', title: 'Test', user_id: 'u1',
        site_id: 1, created_at: '2026-01-01', scrape_failure_count: 0,
        last_scraped_at: '2026-01-01', scrape_failure_email_sent: false,
        scan_frequency: 'hourly', filter_profile_id: null,
      },
    ];
    const newJobs: Job[] = [
      {
        id: 100, user_id: 'u1', externalId: 'ext-1',
        externalUrl: 'https://example.com/job/1', siteId: 1,
        title: 'Engineer', companyName: 'Acme', tags: [],
        status: 'new', labels: [], created_at: new Date(), updated_at: new Date(),
      },
    ];

    mocks.normalHtmlDownloader.loadUrl.mockImplementation(
      async (
        args: { callback: (cb: { html: string; webPageRuntimeData: unknown; maxRetries: number; retryCount: number }) => Promise<unknown> },
      ) => {
        return await args.callback({ html: '<html></html>', webPageRuntimeData: {}, maxRetries: 3, retryCount: 0 });
      },
    );
    mocks.supabaseApi.scanHtmls.mockResolvedValue({ newJobs, parseFailed: false });
    mocks.supabaseApi.listJobs.mockResolvedValueOnce({ jobs: newJobs, hasMore: false, nextPageToken: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new JobScanner(mocks as any);
    await scanner.scanLinks({ links, sendNotification: false });

    // loadUrl is called at least once for the link-list scrape; scanJobs may
    // also call it for per-job description scraping.
    expect(mocks.normalHtmlDownloader.loadUrl.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mocks.supabaseApi.scanHtmls).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseApi.runPostScanHook).toHaveBeenCalledTimes(1);
    expect(mocks.analytics.trackEvent).toHaveBeenCalledWith('scan_links_start', { links_count: 1 });
    expect(mocks.analytics.trackEvent).toHaveBeenCalledWith(
      'scan_links_complete',
      expect.objectContaining({ links_count: 1 }),
    );
  });

  it('scanLinks: returns early when scanner is paused via settings', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new JobScanner(mocks as any);
    scanner.updateSettings({ ...scanner.getSettings(), isPaused: true });

    await scanner.scanLinks({ links: [], sendNotification: false });

    expect(mocks.normalHtmlDownloader.loadUrl).not.toHaveBeenCalled();
    expect(mocks.supabaseApi.scanHtmls).not.toHaveBeenCalled();
    expect(mocks.analytics.trackEvent).toHaveBeenCalledWith(
      'scan_skipped_paused',
      expect.any(Object),
    );
  });

  it('scanLinks: skips when a scan is already running', async () => {
    let resolveFirst: () => void = () => {};
    mocks.normalHtmlDownloader.loadUrl.mockImplementation(
      () => new Promise<unknown[]>((resolve) => { resolveFirst = () => resolve([]); }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new JobScanner(mocks as any);
    const firstScan = scanner.scanLinks({
      links: [{ id: 1 } as Link],
      sendNotification: false,
    });

    // Yield once so first scan registers as in-flight before the second call.
    await new Promise((r) => setImmediate(r));

    await scanner.scanAllLinks();
    expect(mocks.normalHtmlDownloader.loadUrl).toHaveBeenCalledTimes(1);

    resolveFirst();
    await firstScan;
  }, 5000);

  it('showNewJobsNotification: routes pushover via dispatchPushoverSummary when configured', async () => {
    const newJobs: Job[] = [
      {
        id: 100, user_id: 'u1', externalId: 'e',
        externalUrl: 'https://x', siteId: 1, title: 'Engineer',
        companyName: 'Acme', tags: [], status: 'new', labels: [],
        created_at: new Date(), updated_at: new Date(),
      },
    ];
    mocks.supabaseApi.getUser.mockResolvedValue({ user: { id: 'u1' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new JobScanner(mocks as any);
    scanner.updateSettings({
      ...scanner.getSettings(),
      pushoverEnabled: true,
      pushoverAppToken: 'app-token',
      pushoverUserKey: 'user-key',
    });

    scanner.showNewJobsNotification({ newJobs });

    // dispatchPushoverSummary fires async via .then chain. Wait a tick.
    await new Promise((r) => setImmediate(r));

    expect(dispatchPushoverSummary).toHaveBeenCalledTimes(1);
    expect(dispatchPushoverSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'u1',
        jobIds: [100],
        pushoverAppToken: 'app-token',
        pushoverUserKey: 'user-key',
      }),
    );
  });
});
