/**
 * Shared E2E test helpers.
 *
 * IMPORTANT: These helpers access the DB directly via the Drizzle client.
 * playwright.config.ts loads .env.local before workers spawn, so DATABASE_URL
 * is always present at module evaluation time.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import {
  user,
  session,
  account,
  authAuditLog,
  verification,
  transactions,
  categories,
  accounts,
} from "../../drizzle/schema";
import { auth } from "../../lib/auth";

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
 */
export async function resetAndCreateOwner(): Promise<void> {
  // Order matters: delete child tables first (FK constraints)
  await db.delete(authAuditLog);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);

  // Use Better Auth via API to create the owner so password hashing matches login.
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
  await db.delete(authAuditLog).where(eq(authAuditLog.ip, ip));
}

/**
 * Get audit log rows for a specific IP, ordered by occurredAt ascending.
 */
export async function getAuditRowsForIp(ip: string) {
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
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// ===========================================================================
// Phase 2 helpers (Plan 02-09).
//
// These helpers extend the Phase 1 fixture surface with the manual-transaction
// seeding and login primitives required by tests/e2e/transactions.spec.ts and
// tests/e2e/dashboard.spec.ts. They preserve the Phase 1 contract: every Phase 1
// export above remains intact, every helper still requires DATABASE_URL.
// ===========================================================================

import type { Page } from "@playwright/test";

/**
 * Logs the test owner in via the /login form.
 *
 * Caller must already have run `resetAndCreateOwner()` in a `beforeEach` so that
 * the owner row exists. The login flow mirrors `tests/e2e/login.spec.ts` exactly
 * (4 steps), keeping a single canonical implementation.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
  await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

/**
 * Wipes transactions for the seed account so each test starts from a clean slate.
 *
 * - Does NOT delete categories — the 14 seed categories are stable and shared
 *   across all tests; CategorySelect / Filters render them deterministically.
 * - Does NOT delete the seed 'Efectivo' account — Phase 4 will introduce more
 *   accounts; Phase 2 specs rely on the single account always being present.
 */
export async function resetTransactions(): Promise<void> {
  await db.delete(transactions);
}

/**
 * Inserts a transaction directly into the DB for dashboard / list pre-seeding.
 *
 * Used to bypass the Quick-Add Sheet form when a test needs many rows or rows
 * with non-default category kinds (income/transfer for DASH-06 transfer-exclusion
 * coverage, edge dates for trend-chart coverage).
 *
 * Picks the FIRST seeded category of the requested `categoryKind`. The seed list
 * (scripts/seed-categories.ts) is deterministic, so this resolves stably:
 *   expense  → "Supermercado"
 *   income   → "Nómina"
 *   transfer → "Traspaso interno"
 *
 * `amountCents` is bigint and MUST be > 0 (the schema CHECK constraint enforces
 * this; sign is derived from category.kind at aggregation time per D-26).
 *
 * `dedupKey` is randomized per insert so this helper never trips the manual
 * minute-bucket dedup logic (D-22) — that is exercised by the form-driven test.
 */
export async function insertTestTransaction(input: {
  bookingDate: string; // YYYY-MM-DD
  amountCents: bigint;
  description: string;
  categoryKind: "expense" | "income" | "transfer";
}): Promise<void> {
  const cat = await db
    .select()
    .from(categories)
    .where(eq(categories.kind, input.categoryKind))
    .orderBy(categories.sortOrder)
    .limit(1);
  if (cat.length === 0) {
    throw new Error(
      `insertTestTransaction: no seeded category for kind=${input.categoryKind}`,
    );
  }
  const acc = await db.select().from(accounts).limit(1);
  if (acc.length === 0) {
    throw new Error(
      "insertTestTransaction: no seeded account (run db:migrate)",
    );
  }

  await db.insert(transactions).values({
    accountId: acc[0]!.id,
    dedupKey: `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`,
    bookingDate: new Date(input.bookingDate),
    amountCents: input.amountCents,
    amountEurCents: input.amountCents,
    originalCurrency: "EUR",
    descriptionRaw: input.description,
    categoryId: cat[0]!.id,
    categorySource: "manual",
    source: "manual",
  });
}
