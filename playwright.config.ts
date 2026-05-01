import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Phase 1 acceptance tests.
 *
 * Local dev: `npm run test:e2e` auto-starts `next dev` and runs against localhost:3000.
 * Production smoke: `PLAYWRIGHT_BASE_URL=https://your-app.vercel.app npm run test:e2e:remote`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Tests share a single owner; serialize for clean state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker — auth_audit_log assertions are sensitive to interleaving
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Auto-start dev server unless we're hitting a remote URL
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          // Surface the test DATABASE_URL so the dev server uses the test branch
          DATABASE_URL:
            process.env.PLAYWRIGHT_TEST_DATABASE_URL ??
            process.env.DATABASE_URL ??
            "",
        },
      },
});
