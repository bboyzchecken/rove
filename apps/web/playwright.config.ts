import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (X1.1 / X.1).
 *
 * They run against mock mode on purpose: the flows being asserted are the
 * product's, not the database's, and a suite that needs MySQL, Redis and an
 * Anthropic key to run is a suite that stops being run. The repository contract
 * is identical in both modes, so a flow that works here works live — and the
 * live half is covered by the Go tests.
 *
 * The phone project is not optional. This app is used standing on a platform
 * with one hand, and the bottom bar, the drag handles and the sheets only exist
 * at that width.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // WebKit does not survive one instance per core on Windows, and the suite is
  // fast enough that a smaller pool costs nothing.
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },

  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec next dev --turbopack -p 3100',
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_PUBLIC_DATA_MODE: 'mock' },
      },
});
