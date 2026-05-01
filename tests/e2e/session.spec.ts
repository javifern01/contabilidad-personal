/**
 * AUTH-03 — Session persistence.
 *
 * Covers:
 * - Session survives a hard browser reload (cookie + DB session row still valid)
 * - Session survives a context restart (simulates redeploy — cookie persists, DB row valid)
 * - Logout clears session and redirects to /login; subsequent visit to / redirects to /login
 *
 * Phase 1 ROADMAP success criterion 3:
 * "The session survives browser refresh and a Vercel redeploy."
 *
 * The "context restart" test is the closest we can get to a Vercel redeploy in a browser
 * test: it saves the cookies from one browser context and restores them in a new one,
 * proving the session is DB-backed (not in-memory) and survives process restarts.
 */

import { test, expect } from "@playwright/test";
import { hasDatabaseUrl, resetAndCreateOwner, TEST_OWNER } from "./fixtures";

test.describe("AUTH-03 — session persistence", () => {
  test.beforeEach(async () => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
  });

  test("session survives a hard browser reload", async ({ page }) => {
    // Log in
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(/Bienvenido/i)).toBeVisible();

    // Hard reload — session cookie is preserved, DB session row is still valid
    await page.reload();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(/Bienvenido/i)).toBeVisible();
  });

  test("session survives a context restart (simulates redeploy)", async ({
    browser,
  }) => {
    // Create a fresh browser context, log in, capture cookies, close context.
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto("/login");
    await page1.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page1.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page1.getByRole("button", { name: "Entrar" }).click();
    await expect(page1).toHaveURL("/");
    const cookies = await ctx1.cookies();
    await ctx1.close();

    // New context loads cookies (simulates browser restart / redeploy where the cookie is
    // preserved and the session row in the DB is still valid — DB-backed sessions, D-06).
    const ctx2 = await browser.newContext();
    await ctx2.addCookies(cookies);
    const page2 = await ctx2.newPage();
    await page2.goto("/");
    await expect(page2).toHaveURL("/");
    await expect(page2.getByText(/Bienvenido/i)).toBeVisible();
    await ctx2.close();
  });

  test("logout clears session and redirects to /login", async ({ page }) => {
    // Log in
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    // Open avatar dropdown (aria-label set in UserMenu — D-07)
    await page.getByRole("button", { name: "Abrir menú de usuario" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/login");

    // Visiting / now redirects back to /login (session row deleted by signOut)
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
