/**
 * AUTH-02 — Login rate-limit (5 invalid attempts per 15 min per IP).
 *
 * Covers:
 * - 6th invalid attempt within 15 min is blocked with Spanish copy
 * - After rate-limit hits, even correct password is blocked until window passes
 *
 * Phase 1 ROADMAP success criterion 2:
 * "Failed login attempts are rate-limited (5 per 15 minutes per IP) and recorded
 *  in an audit log alongside successes."
 *
 * Note: This spec is slow by design (5 sequential failed login attempts + 1 blocked).
 * In CI it runs with retries=2, so transient Neon connection issues won't cause false
 * failures. The 15-min window is enforced server-side via auth_audit_log (D-12).
 */

import { test, expect } from "@playwright/test";
import { hasDatabaseUrl, resetAndCreateOwner, TEST_OWNER } from "./fixtures";

test.describe("AUTH-02 — login rate-limit (5/15min/IP)", () => {
  test.beforeEach(async () => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
  });

  test("6th invalid attempt within 15 minutes is blocked with Spanish copy", async ({
    page,
  }) => {
    // 5 allowed failures
    for (let i = 1; i <= 5; i++) {
      await page.goto("/login");
      await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
      await page.getByLabel("Contraseña").fill("wrong-password");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByRole("alert")).toHaveText(
        /Credenciales inválidas\./,
      );
    }

    // 6th attempt — should be blocked
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill("wrong-password");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      /Demasiados intentos fallidos\. Vuelve a intentarlo en \d+ minutos?\./,
    );
  });

  test("after rate-limit hits, even correct password is blocked until window passes", async ({
    page,
  }) => {
    // Exhaust the 5 allowed attempts
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
      await page.getByLabel("Contraseña").fill("wrong-password");
      await page.getByRole("button", { name: "Entrar" }).click();
      // Wait for alert before moving to next attempt
      await expect(page.getByRole("alert")).toBeVisible();
    }

    // 6th attempt with CORRECT password — still blocked (rate-limit check is pre-auth)
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(TEST_OWNER.email);
    await page.getByLabel("Contraseña").fill(TEST_OWNER.password); // CORRECT password
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      /Demasiados intentos fallidos\. Vuelve a intentarlo en \d+ minutos?\./,
    );
    // Still on /login, not redirected to /
    await expect(page).toHaveURL(/\/login/);
  });
});
