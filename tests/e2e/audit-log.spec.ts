/**
 * AUTH-05 — auth_audit_log records every outcome.
 *
 * Covers:
 * - login_success row created on successful login (with non-null userId)
 * - login_failure row created with failure_reason='invalid_password' on wrong password
 * - login_blocked row created with failure_reason='rate_limited' when rate-limit triggers
 * - logout row created on "Cerrar sesión" (with non-null userId)
 * - ip column is populated with a non-empty value on every row
 *
 * Phase 1 ROADMAP success criterion 2:
 * "Failed login attempts are rate-limited (5 per 15 minutes per IP) and recorded
 *  in an audit log alongside successes."
 *
 * Requires DATABASE_URL — skipped otherwise.
 */

import { test, expect } from "@playwright/test";
import { hasDatabaseUrl, resetAndCreateOwner, TEST_OWNER } from "./fixtures";

test.describe("AUTH-05 — auth_audit_log records every outcome", () => {
  test.beforeEach(async () => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
  });

  test("login_success row created on successful login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    const { db } = await import("../../lib/db");
    const { authAuditLog } = await import("../../drizzle/schema");
    const rows = await db.select().from(authAuditLog);
    const successes = rows.filter((r) => r.eventType === "login_success");
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes[0]!.userId).not.toBeNull();
  });

  test("login_failure row created with failure_reason on wrong password", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill("wrong");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    const { db } = await import("../../lib/db");
    const { authAuditLog } = await import("../../drizzle/schema");
    const rows = await db.select().from(authAuditLog);
    const failures = rows.filter((r) => r.eventType === "login_failure");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0]!.failureReason).toBe("invalid_password");
  });

  test("login_blocked row created when rate-limit triggers", async ({
    page,
  }) => {
    // Exhaust the 5 allowed failures
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
      await page.getByLabel("Contraseña").fill("wrong");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    }

    // 6th — triggers block + writes login_blocked row
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill("wrong");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      /Demasiados intentos fallidos/,
    );

    const { db } = await import("../../lib/db");
    const { authAuditLog } = await import("../../drizzle/schema");
    const rows = await db.select().from(authAuditLog);
    const blocked = rows.filter((r) => r.eventType === "login_blocked");
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    expect(blocked[0]!.failureReason).toBe("rate_limited");
  });

  test("logout row created on Cerrar sesión", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    // Open avatar dropdown and logout
    await page.getByRole("button", { name: "Abrir menú de usuario" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/login");

    const { db } = await import("../../lib/db");
    const { authAuditLog } = await import("../../drizzle/schema");
    const rows = await db.select().from(authAuditLog);
    const logouts = rows.filter((r) => r.eventType === "logout");
    expect(logouts.length).toBeGreaterThanOrEqual(1);
    expect(logouts[0]!.userId).not.toBeNull();
  });

  test("ip column is populated with a non-empty value on every row", async ({
    page,
  }) => {
    // Trigger at least one audit row
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    const { db } = await import("../../lib/db");
    const { authAuditLog } = await import("../../drizzle/schema");
    const all = await db.select().from(authAuditLog);
    expect(all.length).toBeGreaterThan(0);
    // Every row must have a non-null, non-empty ip
    expect(all.every((r) => r.ip && r.ip.length > 0)).toBe(true);
  });
});
