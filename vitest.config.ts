import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Load .env.local so Vitest has DATABASE_URL, ENCRYPTION_KEY, BETTER_AUTH_* etc.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    test: {
      env,
      environment: "jsdom",
      globals: true,
      setupFiles: ["./vitest.setup.ts"],
      include: ["**/*.test.{ts,tsx}"],
      // Allow zero tests at Phase 1 plan 02 — plans 04, 05 add real tests.
      passWithNoTests: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
  };
});
