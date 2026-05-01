/**
 * FND-05 — Spanish error pages.
 *
 * Covers:
 * - Unknown authenticated route renders "Página no encontrada." in Spanish
 * - The not-found page has lang="es-ES" on the html element
 * - A "Volver al inicio" link is present on the not-found page
 *
 * Phase 1 ROADMAP — FND-05:
 * "All copy, error messages, and LLM prompts produce Spanish."
 * Error pages are user-visible surfaces that must comply with the Spanish-only constraint.
 *
 * Note: The 404 is inside the authenticated route group. The middleware redirects
 * unauthenticated requests to /login, so this test logs in first.
 */

import { test, expect } from "@playwright/test";
import { hasDatabaseUrl, resetAndCreateOwner, TEST_OWNER } from "./fixtures";

test.describe("FND-05 — Spanish error pages", () => {
  test.beforeEach(async () => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
  });

  test("Spanish 404 on unknown authenticated route", async ({ page }) => {
    // Sign in so the not-found page (inside authenticated route group) is reachable;
    // without auth the middleware redirects to /login before Next.js can render not-found.
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    // Visit a route that does not exist
    await page.goto("/this-route-does-not-exist");
    await expect(
      page.getByRole("heading", { name: /Página no encontrada/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Volver al inicio/i }),
    ).toBeVisible();
    // Lang attribute must be es-ES (FND-05 — applies to all pages in the app)
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("es-ES");
  });
});
