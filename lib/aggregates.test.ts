/**
 * Integration tests for dashboard / list aggregates (D-37, D-39, D-40).
 *
 * Tests require DATABASE_URL (Neon dev branch). describe.skipIf gates each suite.
 *
 * Strategy: each test creates a fresh accounts row (uniqueAccount), inserts known
 * transactions for that account, asserts aggregate output, then deletes the
 * account-scoped rows. This avoids cross-test pollution because the seed row
 * 'Efectivo' is NOT used by tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  categories,
  transactions,
  type Account,
  type Category,
  type NewTransaction,
} from "@/drizzle/schema";
import {
  getMonthlyKpis,
  getMonthlyKpisWithDelta,
  getCategoryBreakdown,
  getTrendSeries,
  getTransactionsList,
} from "./aggregates";

const RUN = !!process.env.DATABASE_URL;

async function uniqueAccount(): Promise<Account> {
  const inserted = await db
    .insert(accounts)
    .values({
      displayName: `__test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      currency: "EUR",
      type: "cash",
    })
    .returning();
  return inserted[0]!;
}

async function cleanAccount(accountId: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.accountId, accountId));
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

async function getCat(kind: "expense" | "income" | "transfer"): Promise<Category> {
  const rows = await db.select().from(categories).where(eq(categories.kind, kind)).limit(1);
  if (rows.length === 0) throw new Error(`No seeded category of kind=${kind}`);
  return rows[0]!;
}

function dedupKeyForTest(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

async function insertTxn(input: {
  account: Account;
  category: Category;
  bookingDate: string; // YYYY-MM-DD
  amountCents: bigint;
  description?: string;
}): Promise<void> {
  const row: NewTransaction = {
    accountId: input.account.id,
    dedupKey: dedupKeyForTest(),
    bookingDate: new Date(`${input.bookingDate}T00:00:00Z`),
    amountCents: input.amountCents,
    amountEurCents: input.amountCents,
    originalCurrency: "EUR",
    descriptionRaw: input.description ?? "test row",
    categoryId: input.category.id,
    categorySource: "manual",
    source: "manual",
  };
  await db.insert(transactions).values(row);
}

describe.skipIf(!RUN)("getMonthlyKpis (D-37, D-40)", () => {
  let account: Account;

  beforeEach(async () => {
    account = await uniqueAccount();
  });

  afterEach(async () => {
    await cleanAccount(account.id);
  });

  it("sums income/expense correctly and excludes transfers", async () => {
    const exp = await getCat("expense");
    const inc = await getCat("income");
    const tr = await getCat("transfer");

    await insertTxn({ account, category: inc, bookingDate: "2026-04-01", amountCents: 1000n });
    await insertTxn({ account, category: inc, bookingDate: "2026-04-02", amountCents: 2000n });
    await insertTxn({ account, category: inc, bookingDate: "2026-04-03", amountCents: 3000n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-04", amountCents: 500n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-05", amountCents: 1500n });
    await insertTxn({
      account,
      category: tr,
      bookingDate: "2026-04-06",
      amountCents: 10000n,
    }); // transfer excluded

    const kpi = await getMonthlyKpis({ year: 2026, month: 4, accountId: account.id });
    expect(kpi.income_cents).toBe(6000n);
    expect(kpi.expense_cents).toBe(2000n);
    expect(kpi.net_cents).toBe(4000n);
    expect(kpi.txn_count).toBe(5); // transfer NOT counted
  });

  it("excludes soft-deleted rows", async () => {
    const exp = await getCat("expense");
    const inc = await getCat("income");
    await insertTxn({ account, category: inc, bookingDate: "2026-04-01", amountCents: 1000n });
    const expRow = await db
      .insert(transactions)
      .values({
        accountId: account.id,
        dedupKey: dedupKeyForTest(),
        bookingDate: new Date("2026-04-02T00:00:00Z"),
        amountCents: 500n,
        amountEurCents: 500n,
        originalCurrency: "EUR",
        descriptionRaw: "to-be-soft-deleted",
        categoryId: exp.id,
        categorySource: "manual",
        source: "manual",
        softDeletedAt: new Date(),
      })
      .returning();
    expect(expRow.length).toBe(1);

    const kpi = await getMonthlyKpis({ year: 2026, month: 4, accountId: account.id });
    expect(kpi.income_cents).toBe(1000n);
    expect(kpi.expense_cents).toBe(0n);
    expect(kpi.txn_count).toBe(1);
  });
});

describe.skipIf(!RUN)("getMonthlyKpisWithDelta (D-37, D-33)", () => {
  let account: Account;

  beforeEach(async () => {
    account = await uniqueAccount();
  });

  afterEach(async () => {
    await cleanAccount(account.id);
  });

  it("returns null delta when prior month has zero rows", async () => {
    const inc = await getCat("income");
    await insertTxn({ account, category: inc, bookingDate: "2026-05-01", amountCents: 1000n });
    const result = await getMonthlyKpisWithDelta({
      year: 2026,
      month: 5,
      accountId: account.id,
    });
    expect(result.delta_pct.income).toBeNull();
    expect(result.delta_pct.expense).toBeNull();
    expect(result.delta_pct.net).toBeNull();
  });

  it("computes 1-decimal delta when prior month is nonzero", async () => {
    const inc = await getCat("income");
    await insertTxn({ account, category: inc, bookingDate: "2026-04-15", amountCents: 1000n });
    await insertTxn({ account, category: inc, bookingDate: "2026-05-15", amountCents: 1100n });
    const result = await getMonthlyKpisWithDelta({
      year: 2026,
      month: 5,
      accountId: account.id,
    });
    // 100 / 1000 = 10.0%
    expect(result.delta_pct.income).toBeCloseTo(10.0, 1);
  });

  it("delta on a kpi component with prior=0 but txn_count>0 returns null (div-by-zero guard)", async () => {
    // Prior month has rows (so priorIsEmpty=false), but the income component is 0
    // because the only prior row is an expense. Current month has income.
    // Expected: delta_pct.income === null (pctDelta sees prior=0 with current!=0 → null).
    const inc = await getCat("income");
    const exp = await getCat("expense");
    await insertTxn({ account, category: exp, bookingDate: "2026-04-15", amountCents: 1000n });
    await insertTxn({ account, category: inc, bookingDate: "2026-05-15", amountCents: 1100n });
    const result = await getMonthlyKpisWithDelta({
      year: 2026,
      month: 5,
      accountId: account.id,
    });
    // Prior month has 1 expense row → priorIsEmpty = false. But prior.income_cents = 0.
    expect(result.delta_pct.income).toBeNull();
    // Expense component went from 1000 → 0: prior nonzero, current 0 → -100.0%.
    expect(result.delta_pct.expense).toBeCloseTo(-100.0, 1);
  });
});

describe.skipIf(!RUN)("getCategoryBreakdown (D-37, D-40)", () => {
  let account: Account;

  beforeEach(async () => {
    account = await uniqueAccount();
  });

  afterEach(async () => {
    await cleanAccount(account.id);
  });

  it("returns rows grouped by category, transfers excluded, ordered by total desc", async () => {
    const exp = await getCat("expense");
    const inc = await getCat("income");
    const tr = await getCat("transfer");
    await insertTxn({ account, category: exp, bookingDate: "2026-04-01", amountCents: 5000n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-02", amountCents: 3000n });
    await insertTxn({ account, category: inc, bookingDate: "2026-04-03", amountCents: 9000n });
    await insertTxn({
      account,
      category: tr,
      bookingDate: "2026-04-04",
      amountCents: 99999n,
    });

    const rows = await getCategoryBreakdown({ year: 2026, month: 4, accountId: account.id });
    const cats = rows.map((r) => r.kind);
    expect(cats).not.toContain("transfer");
    // Two distinct categories with non-zero spend after transfer exclusion (1 expense + 1 income).
    expect(rows.length).toBe(2);
    // Top row is income (9000) since 9000 > 8000 (expense aggregated 5000+3000).
    expect(rows[0]!.total_cents).toBe(9000n);
    expect(rows[0]!.kind).toBe("income");
    expect(rows[1]!.total_cents).toBe(8000n);
    expect(rows[1]!.kind).toBe("expense");
  });
});

describe.skipIf(!RUN)("getTrendSeries (D-37, D-35)", () => {
  let account: Account;

  beforeEach(async () => {
    account = await uniqueAccount();
  });

  afterEach(async () => {
    await cleanAccount(account.id);
  });

  it("returns N rows including months with zero data", async () => {
    const inc = await getCat("income");
    // Seed only 2 months out of 6 (4 months ago and current month)
    const today = new Date();
    const fourMonthsAgo = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 15),
    );
    await insertTxn({
      account,
      category: inc,
      bookingDate: fourMonthsAgo.toISOString().slice(0, 10),
      amountCents: 1000n,
    });
    await insertTxn({
      account,
      category: inc,
      bookingDate: today.toISOString().slice(0, 10),
      amountCents: 2000n,
    });

    const rows = await getTrendSeries({ windowMonths: 6, accountId: account.id });
    expect(rows.length).toBe(6);
    // Verify every row has a 'YYYY-MM' month string and ascending order
    for (const r of rows) expect(r.month).toMatch(/^\d{4}-\d{2}$/);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.month > rows[i - 1]!.month).toBe(true);
    }
    // Total nonzero entries: 2
    const nonzero = rows.filter((r) => r.income_cents > 0n || r.expense_cents > 0n);
    expect(nonzero.length).toBe(2);
  });
});

describe.skipIf(!RUN)("getTransactionsList (D-37, D-28)", () => {
  let account: Account;

  beforeEach(async () => {
    account = await uniqueAccount();
  });

  afterEach(async () => {
    await cleanAccount(account.id);
  });

  it("paginates 50 per page, ordered by booking_date desc", async () => {
    const exp = await getCat("expense");
    for (let i = 0; i < 51; i++) {
      const day = (i % 28) + 1;
      const dateStr = `2026-04-${day.toString().padStart(2, "0")}`;
      await insertTxn({
        account,
        category: exp,
        bookingDate: dateStr,
        amountCents: BigInt(100 + i),
        description: `row-${i.toString().padStart(3, "0")}`,
      });
    }
    const page1 = await getTransactionsList({ pag: 1, accountId: account.id });
    expect(page1.rows.length).toBe(50);
    expect(page1.total).toBe(51);
    const page2 = await getTransactionsList({ pag: 2, accountId: account.id });
    expect(page2.rows.length).toBe(1);
  });

  it("ILIKE search is case-insensitive", async () => {
    const exp = await getCat("expense");
    await insertTxn({
      account,
      category: exp,
      bookingDate: "2026-04-01",
      amountCents: 100n,
      description: "Café del Trabajo",
    });
    await insertTxn({
      account,
      category: exp,
      bookingDate: "2026-04-02",
      amountCents: 200n,
      description: "Cena restaurante",
    });
    await insertTxn({
      account,
      category: exp,
      bookingDate: "2026-04-03",
      amountCents: 300n,
      description: "Café casa",
    });
    const result = await getTransactionsList({ q: "café", accountId: account.id });
    expect(result.rows.length).toBe(2);
  });

  it("filters by min/max amount range", async () => {
    const exp = await getCat("expense");
    await insertTxn({ account, category: exp, bookingDate: "2026-04-01", amountCents: 100n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-02", amountCents: 200n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-03", amountCents: 300n });
    const result = await getTransactionsList({
      min: 150n,
      max: 250n,
      accountId: account.id,
    });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.amountCents).toBe(200n);
  });

  it("orders by id desc as tie-breaker for same booking_date", async () => {
    const exp = await getCat("expense");
    await insertTxn({ account, category: exp, bookingDate: "2026-04-01", amountCents: 100n });
    await insertTxn({ account, category: exp, bookingDate: "2026-04-01", amountCents: 200n });
    const result = await getTransactionsList({ accountId: account.id });
    expect(result.rows.length).toBe(2);
    // Stable ordering across two consecutive calls.
    const result2 = await getTransactionsList({ accountId: account.id });
    expect(result.rows.map((r) => r.id)).toEqual(result2.rows.map((r) => r.id));
  });
});
