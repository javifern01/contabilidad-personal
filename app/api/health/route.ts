/**
 * GET /api/health — deployment smoke test and Inngest probe target.
 *
 * Returns:
 *   200 { ok: true, db: "reachable", commit: "<sha>", ts: "<iso>" }
 *   503 { ok: false, db: "unreachable", error: "<msg>" }  (error detail hidden in production)
 *
 * Whitelisted in proxy.ts — no auth required (T-07-V14-health).
 * Error detail suppressed in production to avoid leaking infra topology (T-07-V14-health).
 *
 * Used by:
 * - Plan 08 E2E to confirm deploy is alive
 * - Future Inngest health probes (Phase 5+)
 * - External uptime monitoring (Phase 7)
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic"; // never cache the health probe

export async function GET() {
  try {
    // Cheap round-trip to verify Neon connectivity.
    await db.execute(sql`SELECT 1 AS one`);

    return Response.json(
      {
        ok: true,
        db: "reachable",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        ts: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const isProd = process.env.NODE_ENV === "production";
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "health_check_db_unreachable",
    );

    return Response.json(
      {
        ok: false,
        db: "unreachable",
        // Suppress error details in production to avoid leaking infra topology (T-07-V14-health)
        error: isProd ? "internal" : err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
