import { expect, test } from '@playwright/test';

import { LaunchedApp, appBinaryExists, hasCreds, launchApp, shot } from './fixtures';

// Needs the connections fixture from qa/seed-qa-account.sh and a build pointed at a backend that
// has the connections table.
test.skip(!hasCreds, 'F2A_QA_EMAIL and F2A_QA_PASSWORD are not set, skipping authenticated specs');
test.skip(!appBinaryExists(), 'packaged app not built');

test.describe.configure({ mode: 'serial' });

test.describe('referral contacts', () => {
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

  test('job at a company with contacts shows the badge and the panel', async () => {
    const { page } = ctx;
    // "/" matches both the logo link and the Jobs link, the nav entry is the last match
    await page.locator('nav a[href="/"]').last().click();
    // "QA Co A" has two seeded contacts.
    await expect(page.getByTestId('contact-badge').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('contact-badge').filter({ hasText: '2 contacts' })).toHaveCount(1);
    await page.getByText('QA Remote Engineer').first().click();
    await expect(page.getByTestId('job-contacts')).toBeVisible();
    await expect(page.getByTestId('job-contact')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Open LinkedIn profile' }).first()).toBeVisible();
    await shot(page, 'referrals-panel');
  });

  test('normalization links "QA Co B, Inc." contacts to jobs at "QA Co B"', async () => {
    const { page } = ctx;
    await page.getByText('QA Hybrid Analyst').first().click();
    await expect(page.getByTestId('job-contact')).toHaveCount(1);
  });

  test('a job at a company with no contacts shows no panel', async () => {
    const { page } = ctx;
    await page.getByText('QA Onsite Technician').first().click();
    await expect(page.getByTestId('job-contacts')).toHaveCount(0);
  });
});
