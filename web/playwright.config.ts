import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level checks for the front end, against a production build.
 *
 * Deliberately outside `npm run verify`: these need a downloaded browser, and
 * `verify` has to stay runnable on a clean machine with nothing installed. CI
 * runs them as their own job.
 *
 *   npx playwright install chromium   # once
 *   npm run e2e
 *
 * ponytail: chromium only. Add firefox/webkit projects the day a bug shows up
 * that one browser has and another doesn't — until then it is 3× the CI time
 * for the same answer.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // `next build` is slow but it is the artifact that ships — a dev-server-only
  // check misses everything that only breaks in a production build.
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
