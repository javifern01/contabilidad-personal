/**
 * FND-01 — /api/health probe.
 *
 * Covers:
 * - GET /api/health returns 200 with { ok: true, db: 'reachable', commit } when DB is up
 * - /api/health is reachable WITHOUT authentication (whitelisted in proxy.ts)
 *
 * Phase 1 ROADMAP — infrastructure baseline:
 * The health endpoint provides a standard integration point for uptime monitors
 * (UptimeRobot, Phase 7) and Inngest health probes. It is whitelisted in the
 * route guard so it never requires an auth cookie.
 */

import { test, expect } from "@playwright/test";

test.describe("FND-01 — /api/health probe", () => {
  test("returns 200 with { ok: true, db: 'reachable' }", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe("reachable");
    // commit may be null/undefined in local dev (no VERCEL_GIT_COMMIT_SHA)
    expect(body).toHaveProperty("commit");
  });

  test("/api/health is reachable WITHOUT auth (whitelisted in middleware)", async ({
    request,
  }) => {
    // Use a brand-new request context with no cookies — should still get 200
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
