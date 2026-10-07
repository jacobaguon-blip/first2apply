import { defineConfig } from '@playwright/test';
import path from 'path';

// Report dir is provided by run-qa.sh so screenshots land next to the markdown report.
const reportDir = process.env.F2A_QA_REPORT_DIR ?? path.join(__dirname, 'reports', 'adhoc');

export default defineConfig({
  testDir: path.join(__dirname, 'ui'),
  testMatch: /.*\.spec\.ts/,
  // One Electron app at a time. The app holds a single-instance lock per user-data-dir.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  outputDir: path.join(reportDir, 'playwright-artifacts'),
  reporter: [['list'], ['json', { outputFile: path.join(reportDir, 'playwright-results.json') }]],
});
