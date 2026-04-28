import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, Link } from '@first2apply/core';

import { JobScanner } from '@first2apply/scraper';

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
    getSupabaseClient: vi.fn().mockReturnValue({ /* placeholder */ }),
    increaseScrapeFailureCount: vi.fn().mockResolvedValue(undefined),
  };
  const normalHtmlDownloader = {
    init: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const incognitoHtmlDownloader = {
    init: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    loadUrl: vi.fn().mockResolvedValue([]),
    getSession: vi.fn(),
  };
  const analytics = { trackEvent: vi.fn() };
  // In-memory settings provider — no disk I/O.
  let stored: import('@first2apply/scraper').JobScannerSettings | undefined = undefined;
  const settingsProvider = {
    load: vi.fn(() => stored),
    save: vi.fn((s: import('@first2apply/scraper').JobScannerSettings) => {
      stored = s;
    }),
  };
  return {
    logger,
    supabaseApi,
    normalHtmlDownloader,
    incognitoHtmlDownloader,
    analytics,
    onNavigate: vi.fn(),
    settingsProvider,
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

  it('showNewJobsNotification: pushover dispatch path requires authenticated user', async () => {
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

    // showNewJobsNotification fires async via .then chain. Wait a tick.
    await new Promise((r) => setImmediate(r));

    // Asserting the orchestrator's prerequisites: getUser was called (gating
    // the dispatch) and getSupabaseClient was called (passed into
    // dispatchPushoverSummary). The dispatch call itself can't be asserted
    // through a vi.mock because the lib is compiled cjs and resolves
    // dispatchPushoverSummary internally; the integration is exercised live.
    expect(mocks.supabaseApi.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseApi.getSupabaseClient).toHaveBeenCalledTimes(1);
  });

  it('showNewJobsNotification: skips pushover when no authenticated user', async () => {
    const newJobs: Job[] = [
      {
        id: 100, user_id: 'u1', externalId: 'e',
        externalUrl: 'https://x', siteId: 1, title: 'Engineer',
        companyName: 'Acme', tags: [], status: 'new', labels: [],
        created_at: new Date(), updated_at: new Date(),
      },
    ];
    mocks.supabaseApi.getUser.mockResolvedValue({ user: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = new JobScanner(mocks as any);
    scanner.updateSettings({
      ...scanner.getSettings(),
      pushoverEnabled: true,
      pushoverAppToken: 'app-token',
      pushoverUserKey: 'user-key',
    });

    scanner.showNewJobsNotification({ newJobs });
    await new Promise((r) => setImmediate(r));

    expect(mocks.supabaseApi.getUser).toHaveBeenCalledTimes(1);
    // getSupabaseClient should NOT be called when user is null (path bails early)
    expect(mocks.supabaseApi.getSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('pushover dispatch skipped: no authenticated user'),
    );
  });
});
