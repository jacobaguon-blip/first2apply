import { expect, test } from '@playwright/test';

import { LaunchedApp, appBinaryExists, hasCreds, launchApp, relevantErrors, shot } from './fixtures';

// Needs a build pointed at a real backend (apps/desktopProbe/.env at package time) plus a real
// account. Credentials only ever come from the environment, never from files.
test.skip(!hasCreds, 'F2A_QA_EMAIL and F2A_QA_PASSWORD are not set, skipping authenticated specs');
test.skip(!appBinaryExists(), 'packaged app not built');

test.describe.configure({ mode: 'serial' });

// Real routes from apps/desktopProbe/src/app.tsx and nav labels from components/navbar.tsx.
const PAGES: Array<{ name: string; path: string; heading: RegExp }> = [
  { name: 'jobs', path: '/', heading: /Jobs|New|Applied|Archived/ },
  { name: 'searches', path: '/links', heading: /Job Searches/ },
  { name: 'ai-filters', path: '/filters', heading: /Advanced Matching/ },
  { name: 'settings', path: '/settings', heading: /Settings/ },
  { name: 'help', path: '/help', heading: /FAQs/ },
];

test.describe('desktop authenticated pages', () => {
  let ctx: LaunchedApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    const { page } = ctx;
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.getByLabel('Email').fill(process.env.F2A_QA_EMAIL as string);
    await page.getByLabel('Password').fill(process.env.F2A_QA_PASSWORD as string);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('nav a[href="/links"]')).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  for (const p of PAGES) {
    test(`page renders without error: ${p.name}`, async () => {
      const { page, pageErrors } = ctx;
      const before = pageErrors.length;
      await page.locator(`nav a[href="${p.path}"]`).click();
      await expect(page.getByText(p.heading).first()).toBeVisible();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('Page not found')).toHaveCount(0);
      await page.waitForTimeout(1000);
      await shot(page, `auth-${p.name}`);
      expect(pageErrors.slice(before), 'uncaught page errors').toEqual([]);
    });
  }

  test('no relevant console errors across the visited pages', async () => {
    const relevant = relevantErrors(ctx.consoleErrors);
    expect(relevant, relevant.join(' | ')).toEqual([]);
  });

  test('jobs list has the sort control and location filter', async () => {
    const { page } = ctx;
    await page.locator('nav a[href="/"]').click();
    await page.waitForTimeout(2000);

    // Sort control: button labelled "Sort: <mode>" in the Fit bar (jobTabsContent.tsx).
    // The bar only renders when the active tab has jobs.
    const sortButton = page.getByRole('button', { name: /^Sort:/ });
    if ((await sortButton.count()) === 0) {
      test.skip(true, 'jobs list is empty for this account, sort control is not rendered without jobs');
    }
    await expect(sortButton).toBeVisible();
    await sortButton.click();
    await expect(page.getByRole('menuitemradio', { name: 'Newest first' })).toBeVisible();
    await expect(page.getByRole('menuitemradio', { name: 'Oldest first' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Location filter: a "Location" submenu inside the icon-only filter dropdown
    // (jobFilters/jobFiltersMenu.tsx). The trigger has no label, so probe the menu triggers.
    const triggers = page.locator('[aria-haspopup="menu"]');
    const total = await triggers.count();
    let found = false;
    for (let i = 0; i < total && !found; i++) {
      await triggers.nth(i).click({ trial: false }).catch(() => undefined);
      found = await page
        .getByRole('menuitem', { name: 'Location' })
        .isVisible()
        .catch(() => false);
      if (!found) await page.keyboard.press('Escape');
    }
    expect(found, 'filter menu has a Location entry').toBe(true);
    await shot(page, 'auth-jobs-location-filter');
  });
});
