import { describe, expect, test } from 'vitest';

import { HtmlFetcher, validateCompanyTargetUrl } from '../targetValidator';

const fixtureFetcher = (m: Record<string, string>): HtmlFetcher => ({
  fetchRenderedHtml: async (u: string) => {
    if (m[u] === undefined) throw new Error('no fixture for ' + u);
    return m[u];
  },
});

describe('validateCompanyTargetUrl', () => {
  test('likely_list short-circuits without fetch', async () => {
    let called = false;
    const r = await validateCompanyTargetUrl({
      url: 'https://boards.greenhouse.io/anthropic',
      fetcher: {
        fetchRenderedHtml: async () => {
          called = true;
          return '';
        },
      },
      timeoutMs: 1000,
    });
    expect(r.verdict).toBe('jobs_list');
    expect(called).toBe(false);
  });

  test('greenhouse single-job → suggestion is /<co>', async () => {
    const r = await validateCompanyTargetUrl({
      url: 'https://boards.greenhouse.io/anthropic/jobs/4567',
      fetcher: fixtureFetcher({}),
      timeoutMs: 1000,
    });
    expect(r.verdict).toBe('single_job');
    expect(r.suggestedUrl).toBe('https://boards.greenhouse.io/anthropic');
  });

  test('needs_probe + list html → jobs_list', async () => {
    const html = `<html><body>${Array.from({ length: 4 }, (_, i) => `<a href="/jobs/${i}">x</a>`).join('')}</body></html>`;
    const r = await validateCompanyTargetUrl({
      url: 'https://example.com/careers',
      fetcher: fixtureFetcher({ 'https://example.com/careers': html }),
      timeoutMs: 1000,
    });
    expect(r.verdict).toBe('jobs_list');
  });

  test('probe timeout → unrelated', async () => {
    const r = await validateCompanyTargetUrl({
      url: 'https://example.com/',
      fetcher: {
        fetchRenderedHtml: () => new Promise(() => {}),
      },
      timeoutMs: 50,
    });
    expect(r.verdict).toBe('unrelated');
    expect(r.reason).toMatch(/timeout|timed out/i);
  });

  test('probe throws → unrelated with reason', async () => {
    const r = await validateCompanyTargetUrl({
      url: 'https://example.com/',
      fetcher: {
        fetchRenderedHtml: async () => {
          throw new Error('boom');
        },
      },
      timeoutMs: 1000,
    });
    expect(r.verdict).toBe('unrelated');
    expect(r.reason).toMatch(/boom/);
  });
});
