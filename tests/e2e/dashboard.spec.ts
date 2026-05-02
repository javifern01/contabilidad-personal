/**
 * DASH-01..07 / UX-02 / UX-03 — dashboard rendering.
 *
 * Covers Phase 2 ROADMAP success criteria #3 (monthly KPIs + MoM delta with
 * arrow + percentage), #4 (6–12 month trend chart with <3-month empty state),
 * and parts of #5 (Spanish empty-state copy on every chart).
 *
 * Strategy:
 *   - Each test seeds its own deterministic fixture (specific year-month,
 *     specific cents amounts) so KPI assertions can match exact strings.
 *   - April 2026 is the canonical "current" test month — far enough from the
 *     wall clock that the MonthPicker default never collides with seeded data.
 *   - For chart-render assertions we look for SVG presence rather than parsing
 *     Recharts internal markup; the goal is "the chart rendered in production
 *     mode," not unit-testing Recharts.
 *
 * Spanish copy assertions are verbatim from .planning/phases/02-manual-tracker-mvp/
 * 02-CONTEXT.md "Specifics" §D-32, D-33, D-35 and the "Final copy table".
 */

import { test, expect } from "@playwright/test";
import {
  hasDatabaseUrl,
  resetAndCreateOwner,
  resetTransactions,
  loginAsOwner,
  insertTestTransaction,
} from "./fixtures";

test.describe("DASH-01..07 / UX-02 / UX-03 — dashboard rendering", () => {
  test.beforeEach(async ({ page }) => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
    await resetTransactions();
    await loginAsOwner(page);
  });

  test("DASH-01 / DASH-05 — KPIs render Ingresos/Gastos/Neto with formatEur", async ({
    page,
  }) => {
    // April 2026: 100€ income + 30€ expense → 70€ net.
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 10000n,
      description: "salario",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-16",
      amountCents: 3000n,
      description: "compra",
      categoryKind: "expense",
    });

    await page.goto("/?mes=2026-04");

    // Ingresos card
    await expect(page.getByText("Ingresos")).toBeVisible();
    await expect(page.getByText(/100,00\s*€/)).toBeVisible();

    // Gastos card
    await expect(page.getByText("Gastos")).toBeVisible();
    await expect(page.getByText(/30,00\s*€/)).toBeVisible();

    // Neto card
    await expect(page.getByText("Neto")).toBeVisible();
    await expect(page.getByText(/70,00\s*€/)).toBeVisible();
  });

  test("DASH-03 — MoM delta arrow shows '↑' / '↓' with 1-decimal Spanish percentage", async ({
    page,
  }) => {
    // March 2026: 100€ income; April 2026: 110€ income → +10.0% on Ingresos.
    await insertTestTransaction({
      bookingDate: "2026-03-15",
      amountCents: 10000n,
      description: "march income",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 11000n,
      description: "april income",
      categoryKind: "income",
    });

    await page.goto("/?mes=2026-04");

    // Verbatim MoMDelta output: "↑ 10,0 %" (chevron + space + 1-decimal Spanish + space + %).
    await expect(page.getByText(/↑\s+10,0\s+%/)).toBeVisible();
  });

  test("DASH-03 — MoM empty-state copy when prior month has zero rows", async ({
    page,
  }) => {
    // Only April rows; March is empty so the MoM delta has no prior to compare.
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 10000n,
      description: "april only",
      categoryKind: "income",
    });

    await page.goto("/?mes=2026-04");
    // Each KPI card renders MoMDelta; with no prior data, all three render
    // "Sin datos del mes anterior" so .first() is the safest selector.
    await expect(
      page.getByText("Sin datos del mes anterior").first(),
    ).toBeVisible();
  });

  test("DASH-06 — internal transfer rows excluded from KPIs", async ({
    page,
  }) => {
    // 50€ income + a huge transfer-kind row that MUST NOT appear in any KPI.
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 5000n,
      description: "income row",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-16",
      amountCents: 99999n,
      description: "huge transfer",
      categoryKind: "transfer",
    });

    await page.goto("/?mes=2026-04");
    // Income KPI must be 50,00 € (transfer NOT added).
    await expect(page.getByText(/50,00\s*€/)).toBeVisible();
    // Expense KPI must be 0,00 € (no expenses, transfer NOT counted as expense).
    await expect(page.getByText(/0,00\s*€/)).toBeVisible();
  });

  test("DASH-04 — trend chart shows '<3 months' empty-state copy with 2 months of data", async ({
    page,
  }) => {
    // Only 2 months of data → empty-state precondition (D-35).
    await insertTestTransaction({
      bookingDate: "2026-03-15",
      amountCents: 1000n,
      description: "march",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 2000n,
      description: "april",
      categoryKind: "income",
    });

    await page.goto("/?mes=2026-04");
    await expect(
      page.getByText(
        "Añade transacciones durante al menos 3 meses para ver tu tendencia.",
      ),
    ).toBeVisible();
  });

  test("DASH-04 — trend chart renders SVG when ≥3 months of data exist", async ({
    page,
  }) => {
    await insertTestTransaction({
      bookingDate: "2026-02-15",
      amountCents: 1000n,
      description: "feb",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-03-15",
      amountCents: 2000n,
      description: "mar",
      categoryKind: "income",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 3000n,
      description: "apr",
      categoryKind: "income",
    });

    await page.goto("/?mes=2026-04");
    // The trend chart is wrapped in a <section> with the H2 "Tendencia (últimos 12 meses)".
    const trendSection = page.locator("section", { hasText: "Tendencia" });
    await expect(trendSection.locator("svg").first()).toBeVisible();
    // The empty-state copy must NOT be visible when ≥3 months of data exist.
    await expect(
      page.getByText(
        "Añade transacciones durante al menos 3 meses para ver tu tendencia.",
      ),
    ).toHaveCount(0);
  });

  test("DASH-02 — category bar chart bar click navigates to /transacciones?cat={id}&mes={month}", async ({
    page,
  }) => {
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 5000n,
      description: "compra",
      categoryKind: "expense",
    });
    await page.goto("/?mes=2026-04");

    // Wait for the chart section to render.
    const breakdownSection = page.locator("section", {
      hasText: "Gastos por categoría",
    });
    await expect(breakdownSection.locator("svg").first()).toBeVisible();
    // Recharts renders Bar series inside a <g class="recharts-bar"> with one
    // <rect> per data point. Targeting the bar group's first rect avoids
    // accidentally clicking the chart-background <rect>.
    const firstBar = breakdownSection
      .locator(".recharts-bar rect")
      .first();
    await expect(firstBar).toBeVisible();
    await firstBar.click();

    // Drilldown URL must include both cat= and mes= (DASH-02).
    await expect(page).toHaveURL(
      /\/transacciones\?(?:.*&)?cat=[a-f0-9-]+(?:&|$).*mes=\d{4}-\d{2}|\/transacciones\?(?:.*&)?mes=\d{4}-\d{2}(?:&|$).*cat=[a-f0-9-]+/i,
    );
  });

  test("DASH-07 — month picker drives URL state", async ({ page }) => {
    await insertTestTransaction({
      bookingDate: "2026-03-15",
      amountCents: 5000n,
      description: "march",
      categoryKind: "income",
    });
    await page.goto("/");

    // Open the MonthPicker (aria-label="Mes" on the SelectTrigger).
    await page.getByLabel("Mes").click();
    // Pick "Marzo 2026" — formatMonthEs capitalizes the first letter and drops
    // the "de" connector, so the option text is exactly "Marzo 2026".
    await page.getByRole("option", { name: /Marzo 2026/ }).click();

    await expect(page).toHaveURL(/[?&]mes=2026-03/);
  });

  test("UX-03 — currency format uses 'es-ES' decimal-comma (1.234,56 €)", async ({
    page,
  }) => {
    // 1234.56€ → 123456 cents → formatEur → "1.234,56 €".
    await insertTestTransaction({
      bookingDate: "2026-04-15",
      amountCents: 123456n,
      description: "thousand",
      categoryKind: "income",
    });
    await page.goto("/?mes=2026-04");

    // Spanish thousands dot + decimal comma + non-breaking space + €.
    await expect(page.getByText(/1\.234,56\s*€/)).toBeVisible();
  });
});
