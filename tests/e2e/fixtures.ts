/**
 * Shared E2E test helpers.
 *
 * IMPORTANT: These helpers access the DB directly using the Drizzle client.
 * They require a running database (DATABASE_URL or PLAYWRIGHT_TEST_DATABASE_URL).
 * When DATABASE_URL is not set, DB-dependent helpers will throw — callers must
 * skip their test in that case.
 *
 * Path aliases (@/) are resolved by Playwright via tsconfig.json paths config.
 */

import { eq, sql } from "drizzle-orm";

export const TEST_OWNER = {
  email: "owner-e2e@example.test",
  password: "TestPassword123!",
  name: "E2E Owner",
};

/**
 * Whether a database connection is available for tests that need it.
 * Checks for DATABASE_URL or PLAYWRIGHT_TEST_DATABASE_URL.
 */
export function hasDatabaseUrl(): boolean {
  return !!(
    process.env.PLAYWRIGHT_TEST_DATABASE_URL ?? process.env.DATABASE_URL
  );
}

/**
 * Wipe all auth state and create a single owner for the test run.
 * Must be called in test.beforeEach for any spec that depends on owner state.
 *
 * Requires DATABASE_URL or PLAYWRIGHT_TEST_DATABASE_URL to be set.
 */
export async function resetAndCreateOwner(): Promise<void> {
  const { db } = await import("../../lib/db");
  const {
    user,
    session,
    account,
    authAuditLog,
    verification,
  } = await import("../../drizzle/schema");

  // Order matters: delete child tables first (FK constraints)
  await db.delete(authAuditLog);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);

  // Use Better Auth via API to create the owner so password hashing matches login.
  const { auth } = await import("../../lib/auth");
  await auth.api.signUpEmail({
    body: {
      email: TEST_OWNER.email,
      password: TEST_OWNER.password,
      name: TEST_OWNER.name,
    },
  });
}

/**
 * Delete audit log rows for a specific IP address.
 */
export async function deleteAuditRowsForIp(ip: string): Promise<void> {
  const { db } = await import("../../lib/db");
  const { authAuditLog } = await import("../../drizzle/schema");
  await db.delete(authAuditLog).where(eq(authAuditLog.ip, ip));
}

/**
 * Get audit log rows for a specific IP, ordered by occurredAt ascending.
 */
export async function getAuditRowsForIp(ip: string) {
  const { db } = await import("../../lib/db");
  const { authAuditLog } = await import("../../drizzle/schema");
  return db
    .select()
    .from(authAuditLog)
    .where(eq(authAuditLog.ip, ip))
    .orderBy(authAuditLog.occurredAt);
}

/**
 * Check if the database is reachable.
 */
export async function dbReachable(): Promise<boolean> {
  try {
    const { db } = await import("../../lib/db");
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
