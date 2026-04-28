import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // ONLY pick up tests that have been migrated to vitest. The legacy
    // hand-rolled inline-harness tests (tailored/builder.test.ts,
    // masterContent/parse.test.ts, connections/connections.test.ts,
    // ai/budget.test.ts, keywords/keywords.test.ts) run assertions at
    // module top level and would corrupt the vitest run on import.
    // Migrate those files in their own follow-up PR.
    // quietHours.test.ts moved to libraries/scraper as part of the PR 2 extraction.
    // Vitest there is a follow-up. For now, desktop's vitest only runs the
    // JobScanner orchestration tests against the lib's exported class.
    include: ['src/server/__tests__/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'src/server/tailored/**',
      'src/server/masterContent/**',
      'src/server/connections/**',
      'src/server/ai/**',
      'src/server/keywords/**',
    ],
    environment: 'node',
    globals: false,
    // Electron-coupled modules are mocked via vi.mock() in test files;
    // never imported as the real `electron` package.
    server: { deps: { external: ['electron'] } },
  },
});
