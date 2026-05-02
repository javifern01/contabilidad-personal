import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

/**
 * Playwright config for Phase 1 acceptance tests.
 *
 * Local dev: `npm run test:e2e` auto-starts `next dev` and runs against localhost:3000.
 * Production smoke: `PLAYWRIGHT_BASE_URL=https://your-app.vercel.app npm run test:e2e:remote`.
 */

// Load .env.local — Playwright doesn't auto-load it, but both the spawned dev
// server (needs ENCRYPTION_KEY / BETTER_AUTH_SECRET / BETTER_AUTH_URL) AND the
// Playwright runner itself (fixtures call hasDatabaseUrl() against process.env)
// need these vars. Same pattern vitest.config.ts uses.
const localEnv = loadEnv("development", process.cwd(), "");
for (const [k, v] of Object.entries(localEnv)) {
  if (!(k in process.env)) process.env[k] = v;
}
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
          ...localEnv,
          ...(process.env as Record<string, string>),
          DATABASE_URL:
            process.env.PLAYWRIGHT_TEST_DATABASE_URL ??
            process.env.DATABASE_URL ??
            localEnv.DATABASE_URL ??
            "",
        },
      },
});
