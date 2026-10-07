import { expect, test } from '@playwright/test';

import { LaunchedApp, appBinary, appBinaryExists, launchApp, relevantErrors, shot } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('desktop smoke (unauthenticated, isolated user-data-dir)', () => {
  let ctx: LaunchedApp;

  test.beforeAll(async () => {
    if (!appBinaryExists()) {
      throw new Error(
        `Packaged app not found at ${appBinary()}. Run: pnpm --filter first2apply-desktop package (or qa/run-qa.sh ui, which builds it).`,
      );
    }
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('window opens and the renderer root renders', async () => {
    const { browser, page } = ctx;
    expect(browser.contexts()[0].pages().length).toBeGreaterThan(0);
    await expect(page.locator('#app')).toBeAttached();
    // React mounted something inside the root.
    await expect(page.locator('#app > *').first()).toBeAttached();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    await shot(page, 'smoke-01-window');
  });

  test('unauthenticated state shows the login screen', async () => {
    const { page } = ctx;
    // AuthGuard redirects to /login once the session finishes loading.
    await expect(page.getByText('Log in', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await shot(page, 'smoke-03-login');
  });

  test('no uncaught renderer errors on first load', async () => {
    const { page, consoleErrors, pageErrors } = ctx;
    // Give async startup (session load, redirects) a moment to surface errors.
    await page.waitForTimeout(2000);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    const relevant = relevantErrors(consoleErrors);
    expect(relevant, `console errors: ${relevant.join(' | ')}`).toEqual([]);
  });
});
