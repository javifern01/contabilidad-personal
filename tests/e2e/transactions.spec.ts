/**
 * MAN-01..05 / LIST-01..05 / UX-02 — manual transaction lifecycle.
 *
 * Covers Phase 2 ROADMAP success criteria #1 (manual add/edit/soft-delete in ≤4
 * fields with Manual badge), #2 (browse list with search/filter/pagination at
 * 50/page) and parts of #5 (Spanish empty/loading/error copy).
 *
 * Every test starts from a known-clean state:
 *   - resetAndCreateOwner — wipes auth tables + recreates the test owner
 *   - resetTransactions   — wipes the transactions table (categories + 'Efectivo'
 *                           account stay; they are seeded by db:migrate and stable)
 *   - loginAsOwner        — drives the /login form so the session cookie is real
 *
 * Spanish copy assertions are verbatim from .planning/phases/02-manual-tracker-mvp/
 * 02-CONTEXT.md "Specifics" section. Any change to those strings means changing
 * BOTH the UI component AND this spec — the verbatim coupling is the point.
 *
 * Skip behaviour: tests skip cleanly when DATABASE_URL / PLAYWRIGHT_TEST_DATABASE_URL
 * is absent (Phase 1 fixture pattern). CI provides the Neon dev branch URL.
 */

import { test, expect } from "@playwright/test";
import {
  hasDatabaseUrl,
  resetAndCreateOwner,
  resetTransactions,
  loginAsOwner,
  insertTestTransaction,
} from "./fixtures";

test.describe("MAN-01..05 / LIST-01..05 / UX-02 — manual transaction lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    if (!hasDatabaseUrl()) {
      test.skip();
      return;
    }
    await resetAndCreateOwner();
    await resetTransactions();
    await loginAsOwner(page);
  });

  test("LIST-05 / UX-02 — pristine empty state shows 'Aún no has añadido ninguna transacción.'", async ({
    page,
  }) => {
    await page.goto("/transacciones");
    await expect(
      page.getByText("Aún no has añadido ninguna transacción."),
    ).toBeVisible();
  });

  test("MAN-01 / MAN-02 / MAN-05 — add transaction via Quick-Add Sheet (4 fields) and see Manual badge", async ({
    page,
  }) => {
    await page.goto("/transacciones");

    // Open the Sheet via the AddFab in the header (D-43). Multiple "Añadir
    // transacción" buttons exist (header + mobile FAB + Sheet submit), so we pick
    // the first one which is the header trigger on desktop viewport.
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .first()
      .click();
    await expect(page).toHaveURL(/[?&]nuevo=1/);

    // Fill the 4 required fields, in keyboard-flow order (D-24).
    await page.getByLabel("Importe").fill("12,34");
    await page
      .getByLabel("Fecha")
      .fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel("Descripción").fill("E2E test row");

    // Open the kind-grouped Select and pick the seeded "Supermercado" expense.
    await page.getByLabel("Categoría").click();
    await page.getByRole("option", { name: "Supermercado" }).click();

    // Submit — the Sheet footer's submit button reuses the "Añadir transacción"
    // label so we scope the click to the form-submission path via the form id.
    // Picking it by role + last() ensures we don't re-click the FAB.
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .last()
      .click();

    // Toast confirms success (D-24, sonner copy).
    await expect(page.getByText("Transacción añadida")).toBeVisible();

    // Sheet closes — URL no longer has ?nuevo=1.
    await expect(page).not.toHaveURL(/[?&]nuevo=1/);

    // Row appears in the list.
    await expect(page.getByText("E2E test row")).toBeVisible();

    // MAN-05: the SourceBadge renders "Manual" for source='manual' rows.
    await expect(page.getByText("Manual").first()).toBeVisible();
  });

  test("MAN-01 — dedup-collision returns Spanish error within same minute", async ({
    page,
  }) => {
    await page.goto("/transacciones");

    // Row #1 — submit normally.
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .first()
      .click();
    await page.getByLabel("Importe").fill("9,99");
    await page
      .getByLabel("Fecha")
      .fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel("Descripción").fill("dedup-test");
    await page.getByLabel("Categoría").click();
    await page.getByRole("option", { name: "Supermercado" }).click();
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .last()
      .click();
    await expect(page.getByText("Transacción añadida")).toBeVisible();

    // Row #2 — identical inputs immediately (same minute bucket per D-22).
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .first()
      .click();
    await page.getByLabel("Importe").fill("9,99");
    await page
      .getByLabel("Fecha")
      .fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel("Descripción").fill("dedup-test");
    await page.getByLabel("Categoría").click();
    await page.getByRole("option", { name: "Supermercado" }).click();
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .last()
      .click();

    // Verbatim CONTEXT.md duplicate copy (D-22 / Plan 03 Server Action).
    await expect(
      page.getByText(
        "Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?",
      ),
    ).toBeVisible();
  });

  test("MAN-04 — soft-delete with Deshacer toast restores within 5s", async ({
    page,
  }) => {
    // Pre-seed one row directly in the DB so we don't depend on the form.
    await insertTestTransaction({
      bookingDate: new Date().toISOString().slice(0, 10),
      amountCents: 500n,
      description: "to-be-deleted",
      categoryKind: "expense",
    });

    await page.goto("/transacciones");
    await expect(page.getByText("to-be-deleted")).toBeVisible();

    // Click Borrar on the row.
    await page.getByRole("button", { name: "Borrar" }).first().click();

    // Toast with Deshacer action (5 s window per D-30 / RowActions.tsx).
    await expect(page.getByText("Transacción borrada")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();

    // Restore confirmation toast + row reappears in the list.
    await expect(page.getByText("Transacción restaurada")).toBeVisible();
    await expect(page.getByText("to-be-deleted")).toBeVisible();
  });

  test("MAN-03 — edit a transaction via ?editar={id} URL", async ({ page }) => {
    await insertTestTransaction({
      bookingDate: new Date().toISOString().slice(0, 10),
      amountCents: 500n,
      description: "before-edit",
      categoryKind: "expense",
    });

    await page.goto("/transacciones");
    await expect(page.getByText("before-edit")).toBeVisible();
    await page.getByRole("button", { name: "Editar" }).first().click();

    await expect(page).toHaveURL(/[?&]editar=/);

    // Description is prefilled — clear and re-type.
    const descInput = page.getByLabel("Descripción");
    await descInput.clear();
    await descInput.fill("after-edit");

    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados")).toBeVisible();

    // List re-renders with the new description; old one is gone.
    await expect(page.getByText("after-edit")).toBeVisible();
    await expect(page.getByText("before-edit")).toHaveCount(0);
  });

  test("LIST-02 — search filter narrows by description (ILIKE case-insensitive)", async ({
    page,
  }) => {
    await insertTestTransaction({
      bookingDate: "2026-04-01",
      amountCents: 100n,
      description: "Café del Trabajo",
      categoryKind: "expense",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-02",
      amountCents: 200n,
      description: "Cena restaurante",
      categoryKind: "expense",
    });
    await insertTestTransaction({
      bookingDate: "2026-04-03",
      amountCents: 300n,
      description: "Café casa",
      categoryKind: "expense",
    });

    await page.goto("/transacciones");
    await page.getByLabel("Buscar").fill("café");

    // nuqs URL update may be debounced via React transitions — wait for either
    // the URL-encoded form (q=caf%C3%A9) or the literal form, whichever the
    // browser settled on after the transition.
    await page.waitForURL(/[?&]q=(caf%C3%A9|caf%c3%a9|café)/);

    await expect(page.getByText("Café del Trabajo")).toBeVisible();
    await expect(page.getByText("Café casa")).toBeVisible();
    // The non-matching row must be filtered out.
    await expect(page.getByText("Cena restaurante")).toHaveCount(0);
  });

  test("LIST-04 — pagination: 51 rows produce 2 pages, page 2 shows 'Página 2 de 2'", async ({
    page,
  }) => {
    // Pre-seed 51 rows. Booking date varies day-of-month so they are distinct
    // dedup_key values; description includes the index so we can spot-check
    // ordering after navigating to page 2.
    for (let i = 0; i < 51; i++) {
      await insertTestTransaction({
        bookingDate: `2026-04-${(1 + (i % 28)).toString().padStart(2, "0")}`,
        amountCents: BigInt(100 + i),
        description: `pag-row-${i.toString().padStart(3, "0")}`,
        categoryKind: "expense",
      });
    }

    await page.goto("/transacciones");
    await expect(page.getByText(/Página 1 de 2/)).toBeVisible();
    // Total uses Spanish locale formatting — for 51 there is no thousands sep,
    // so the literal "51 transacciones" string is sufficient.
    await expect(page.getByText(/51 transacciones/)).toBeVisible();

    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/[?&]pag=2/);
    await expect(page.getByText(/Página 2 de 2/)).toBeVisible();
  });

  test("LIST-05 — filter-empty state shows 'No hay transacciones que coincidan con los filtros.'", async ({
    page,
  }) => {
    await insertTestTransaction({
      bookingDate: "2026-04-01",
      amountCents: 100n,
      description: "real row",
      categoryKind: "expense",
    });
    await page.goto("/transacciones");
    await page.getByLabel("Buscar").fill("zzznonmatchzzz");
    await expect(
      page.getByText("No hay transacciones que coincidan con los filtros."),
    ).toBeVisible();
  });

  test("LIST-03 — multi-select category filter shows rows from BOTH selected categories", async ({
    page,
  }) => {
    // Pre-seed two rows in different expense categories. We bypass
    // insertTestTransaction's "first category for kind" rule for the second row
    // so we can target the "Restaurantes" category specifically.
    const { db } = await import("../../lib/db");
    const { categories, transactions, accounts } = await import(
      "../../drizzle/schema"
    );
    const { eq } = await import("drizzle-orm");

    const supermercado = (
      await db
        .select()
        .from(categories)
        .where(eq(categories.name, "Supermercado"))
        .limit(1)
    )[0];
    const restaurantes = (
      await db
        .select()
        .from(categories)
        .where(eq(categories.name, "Restaurantes"))
        .limit(1)
    )[0];
    if (!supermercado || !restaurantes) {
      throw new Error("Seed missing Supermercado/Restaurantes categories");
    }

    // Row 1 — Supermercado (insertTestTransaction picks the first 'expense' by
    // sortOrder, which is Supermercado per scripts/seed-categories.ts).
    await insertTestTransaction({
      bookingDate: "2026-04-01",
      amountCents: 1500n,
      description: "compra-supermercado",
      categoryKind: "expense",
    });

    // Row 2 — Restaurantes, inserted directly so we can pin the categoryId.
    const acc = (await db.select().from(accounts).limit(1))[0]!;
    await db.insert(transactions).values({
      accountId: acc.id,
      dedupKey: `e2e_multiselect_${Date.now()}`,
      bookingDate: new Date("2026-04-02"),
      amountCents: 2500n,
      amountEurCents: 2500n,
      originalCurrency: "EUR",
      descriptionRaw: "cena-restaurantes",
      categoryId: restaurantes.id,
      categorySource: "manual",
      source: "manual",
    });

    await page.goto("/transacciones");

    // Open the multi-select Popover — the trigger label is "Categorías (N)"
    // where N is the current selection count, so a regex match is robust to
    // the count changing as we click checkboxes.
    await page.getByRole("button", { name: /Categorías/ }).click();
    await page
      .getByRole("checkbox", { name: "Supermercado" })
      .check();
    await page
      .getByRole("checkbox", { name: "Restaurantes" })
      .check();
    // Close the popover so the URL settle finishes (Filters.tsx writes via
    // startTransition, but React Strict Mode in dev can delay the URL update).
    await page.keyboard.press("Escape");

    // URL must contain cat= with TWO comma-separated UUIDs (encoded or raw).
    await page.waitForURL(
      /[?&]cat=[a-f0-9-]+(?:%2C|,)[a-f0-9-]+/i,
    );

    // Both rows are visible.
    await expect(page.getByText("compra-supermercado")).toBeVisible();
    await expect(page.getByText("cena-restaurantes")).toBeVisible();
  });

  test("LIST-05 — /transacciones recovers cleanly after a failed navigation", async ({
    page,
  }) => {
    // WR-05: the previous version of this test asserted
    //   `expect(boundaryVisible || retryVisible || true).toBe(true)`
    // which always passed regardless of whether the error boundary actually
    // rendered — worse than no test (gave false confidence that LIST-05 was
    // covered).
    //
    // Forcing the route-level error.tsx to render without modifying app code
    // is genuinely hard: route.fulfill() with a 500 body bypasses the React
    // render lifecycle (so error.tsx never runs), and adding a hidden
    // ?_throw_test=1 server-side hook just for tests would land production
    // code that intentionally throws — a worse trade than dropping the
    // boundary-copy assertion.
    //
    // We narrow this test to what we CAN deterministically prove from
    // Playwright: a 500 navigation does not corrupt the SPA — the next
    // visit to /transacciones renders the row list correctly. The boundary
    // copy itself is verified via:
    //   - app/(authenticated)/transacciones/error.tsx source (it is the
    //     verbatim CONTEXT specifics LIST-05 string), and
    //   - the route-level Vitest unit test (Plan 06) that imports error.tsx
    //     and snapshot-matches the rendered Spanish copy.
    // SUMMARY.md "Known Issues" tracks the gap.
    await insertTestTransaction({
      bookingDate: "2026-04-01",
      amountCents: 1000n,
      description: "real-row",
      categoryKind: "expense",
    });

    // Baseline: known-good page renders the seeded row.
    await page.goto("/transacciones");
    await expect(page.getByText("real-row")).toBeVisible();

    // Inject a 500 on the next ?_throw=1 navigation (only the document, not
    // its asset dependencies — keeps the SPA chrome alive for the recovery
    // assertion below).
    await page.route("**/transacciones**", async (route, request) => {
      const url = request.url();
      if (request.resourceType() === "document" && url.includes("_throw=1")) {
        await route.fulfill({ status: 500, body: "boom" });
      } else {
        await route.continue();
      }
    });

    await page.goto("/transacciones?_throw=1").catch(() => {
      // 500 navigation may surface as a Playwright nav error; swallow so the
      // recovery assertion runs.
    });

    // Recovery: unroute and navigate to the clean URL. The row list must
    // render — proves the SPA + RSC pipeline is intact after the synthetic
    // failure (the actual scope this test can credibly cover).
    await page.unroute("**/transacciones**");
    await page.goto("/transacciones");
    await expect(page.getByText("real-row")).toBeVisible();
  });

  test("UX-02 / D-43 — AddFab preserves existing URL state (q, pag) when adding ?nuevo=1", async ({
    page,
  }) => {
    // Pre-seed a row so /transacciones renders the FAB-eligible page.
    await insertTestTransaction({
      bookingDate: "2026-04-01",
      amountCents: 1000n,
      description: "fab-preservation-test",
      categoryKind: "expense",
    });

    // Navigate with existing query params (search + pagination) — the URL
    // must survive the FAB tap with only ?nuevo=1 appended.
    await page.goto("/transacciones?q=caf%C3%A9&pag=2");

    // Click the FAB. The header variant is the first "Añadir transacción"
    // role=button on desktop viewport; mobile variant exists but is hidden.
    await page
      .getByRole("button", { name: "Añadir transacción" })
      .first()
      .click();

    // URL must now have nuevo=1 AND retain q=café AND pag=2 (order-independent).
    await page.waitForURL(/[?&]nuevo=1/);
    const url = page.url();
    expect(url).toMatch(/[?&]q=caf%C3%A9/i);
    expect(url).toMatch(/[?&]pag=2/);
    expect(url).toMatch(/[?&]nuevo=1/);
  });
});
