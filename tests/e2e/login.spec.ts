/**
 * AUTH-01 — Login with email and password.
 *
 * Covers:
 * - Spanish login form renders correctly
 * - Unauthenticated redirect to /login?next=<path>
 * - Valid credentials → redirect to / with authenticated landing
 * - Invalid password → generic "Credenciales inválidas." (no user enumeration)
 * - Unknown email → same generic error (ASVS L1 V2)
 *
 * Phase 1 ROADMAP success criterion 1:
 * "Owner can navigate to the deployed app, log in with email/password, and see
 *  an authenticated landing page in Spanish."
 */

import { test, expect } from "@playwright/test";
import { hasDatabaseUrl, resetAndCreateOwner, TEST_OWNER } from "./fixtures";

test.describe("AUTH-01 — login with email and password", () => {
  test.beforeEach(async () => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
  });

  test("renders Spanish login form at /login", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    // Page lang attribute is es-ES (FND-05)
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("es-ES");
  });

  test("redirects unauthenticated request to /login with next param", async ({
    page,
  }) => {
    await page.goto("/some-protected-path");
    await expect(page).toHaveURL(/\/login\?next=%2Fsome-protected-path/);
  });

  test("valid credentials → redirects to / and shows authenticated landing", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(/Bienvenido/i)).toBeVisible();
  });

  test("invalid password → 'Credenciales inválidas.'", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill("wrong-password");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Credenciales inválidas\./);
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown email → 'Credenciales inválidas.' (no user enumeration)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("nonexistent@example.test");
    await page.getByLabel("Contraseña").fill("any-password");
    await page.getByRole("button", { name: "Entrar" }).click();
    // Error message MUST be identical to the wrong-password case (ASVS L1 V2)
    await expect(page.getByRole("alert")).toHaveText(/Credenciales inválidas\./);
  });
});
