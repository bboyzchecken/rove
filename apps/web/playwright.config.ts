import { defineConfig, devices } from '@playwright/test';

/**
 * e2e config. Two mobile projects are not optional: DEV_SPEC X5.1 requires the
 * drag-and-drop timeline to be tested on real iOS Safari and Android Chrome
 * engines, and that is where touch dragging actually breaks.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'ios', use: { ...devices['iPhone 14'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],

  // Reuse a running dev server locally; CI starts its own.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
