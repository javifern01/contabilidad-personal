/**
 * Integration tests for transaction Server Actions (D-42).
 *
 * Requires DATABASE_URL (Neon dev branch). Wrapped in describe.skipIf so CI without
 * DB skips cleanly. Each test uses a unique-prefix description string so concurrent
 * runs don't collide; cleanup deletes by description prefix.
 *
 * Session injection (T-02-07 mitigation):
 *   We mock @/lib/auth so auth.api.getSession resolves to a fake session object.
 *   Without the mock the production code path returns server_error (correct: there
 *   is no NODE_ENV bypass anywhere in the actions module). The Playwright suite
 *   (Plan 09) exercises the real session-required path end-to-end through HTTP.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  categories,
  transactions,
  type Account,
  type Category,
} from "@/drizzle/schema";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "test-owner-id", email: "owner@test.local", name: "Owner" },
        session: { id: "test-session-id" },
      }),
    },
  },
}));

// Stub next/headers since the production module needs a Next.js request context.
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Stub next/cache because revalidateTag is only safe inside a Next request context.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import {
  addTransaction,
  editTransaction,
  softDeleteTransaction,
  restoreTransaction,
} from "./transactions";

const RUN = !!process.env.DATABASE_URL;

function uniqueDescription(): string {
  return `__test_${Math.random().toString(36).slice(2, 12)}__`;
}

async function getSeededExpenseCategory(): Promise<Category> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.kind, "expense"))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("No expense category seeded — run db:migrate first");
  }
  return rows[0]!;
}

async function getSeededAccount(): Promise<Account> {
  const rows = await db.select().from(accounts).limit(1);
  if (rows.length === 0) {
    throw new Error("No account seeded — run db:migrate first");
  }
  return rows[0]!;
}

function buildFormData(input: {
  amount: string;
  bookingDate: string; // YYYY-MM-DD
  description: string;
  categoryId: string;
  accountId?: string;
}): FormData {
  const fd = new FormData();
  fd.set("amount", input.amount);
  fd.set("booking_date", input.bookingDate);
  fd.set("description", input.description);
  fd.set("category_id", input.categoryId);
  if (input.accountId) fd.set("account_id", input.accountId);
  return fd;
}

describe.skipIf(!RUN)("addTransaction (D-42)", () => {
  let cleanupDescriptions: string[] = [];

  afterEach(async () => {
    for (const d of cleanupDescriptions) {
      await db.delete(transactions).where(like(transactions.descriptionRaw, `${d}%`));
    }
    cleanupDescriptions = [];
  });

  it("inserts a valid expense transaction and returns ok+id", async () => {
    const account = await getSeededAccount();
    const category = await getSeededExpenseCategory();
    const desc = uniqueDescription();
    cleanupDescriptions.push(desc);

    const result = await addTransaction(
      buildFormData({
        amount: "12,34",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: desc,
        categoryId: category.id,
        accountId: account.id,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.id).toBe("string");
      // Confirm row landed in DB with correct manual-source markers.
      const row = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, result.id))
        .limit(1);
      expect(row[0]?.source).toBe("manual");
      expect(row[0]?.categorySource).toBe("manual");
      expect(row[0]?.amountCents).toBe(1234n);
      expect(row[0]?.amountEurCents).toBe(1234n);
    }
  });

  it("rejects amount=0 with kind=validation", async () => {
    const category = await getSeededExpenseCategory();
    const result = await addTransaction(
      buildFormData({
        amount: "0",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: uniqueDescription(),
        categoryId: category.id,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
  });

  it("rejects description > 200 chars with kind=validation", async () => {
    const category = await getSeededExpenseCategory();
    const result = await addTransaction(
      buildFormData({
        amount: "10,00",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: "x".repeat(201),
        categoryId: category.id,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
  });

  it("rejects bookingDate > today + 1 day with kind=validation (D-24 clamp)", async () => {
    const category = await getSeededExpenseCategory();
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = await addTransaction(
      buildFormData({
        amount: "10,00",
        bookingDate: future.toISOString().slice(0, 10),
        description: uniqueDescription(),
        categoryId: category.id,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
  });

  it("rejects unknown category_id (FK 23503 → kind=validation w/ category_id error)", async () => {
    // The all-zeros UUID is well-formed but not present in the categories table.
    const result = await addTransaction(
      buildFormData({
        amount: "10,00",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: uniqueDescription(),
        categoryId: "00000000-0000-0000-0000-000000000000",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
      if (result.kind === "validation") {
        expect(result.fieldErrors.category_id?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("returns kind=duplicate on second insert in same minute (D-22)", async () => {
    const category = await getSeededExpenseCategory();
    const desc = uniqueDescription();
    cleanupDescriptions.push(desc);
    const fd = buildFormData({
      amount: "9,99",
      bookingDate: new Date().toISOString().slice(0, 10),
      description: desc,
      categoryId: category.id,
    });
    const r1 = await addTransaction(fd);
    expect(r1.ok).toBe(true);
    // Build a fresh FormData (FormData is single-use after a Server Action consumes it).
    const fd2 = buildFormData({
      amount: "9,99",
      bookingDate: new Date().toISOString().slice(0, 10),
      description: desc,
      categoryId: category.id,
    });
    const r2 = await addTransaction(fd2);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.kind).toBe("duplicate");
  });
});

describe.skipIf(!RUN)(
  "editTransaction / softDeleteTransaction / restoreTransaction (D-42)",
  () => {
    let txnId: string;
    let descriptionPrefix: string;
    let categoryId: string;

    beforeEach(async () => {
      const cat = await getSeededExpenseCategory();
      categoryId = cat.id;
      descriptionPrefix = uniqueDescription();
      const result = await addTransaction(
        buildFormData({
          amount: "5,00",
          bookingDate: new Date().toISOString().slice(0, 10),
          description: descriptionPrefix,
          categoryId,
        }),
      );
      if (!result.ok) throw new Error("test setup failed: addTransaction did not return ok");
      txnId = result.id;
    });

    afterEach(async () => {
      await db.delete(transactions).where(like(transactions.descriptionRaw, `${descriptionPrefix}%`));
    });

    it("editTransaction updates a non-deleted row and bumps updated_at", async () => {
      // Read the original updatedAt to verify the bump.
      const before = await db
        .select({ updatedAt: transactions.updatedAt })
        .from(transactions)
        .where(eq(transactions.id, txnId))
        .limit(1);
      const beforeMs = before[0]!.updatedAt.getTime();

      // Tiny pause so the new timestamp is strictly greater.
      await new Promise((r) => setTimeout(r, 10));

      const fd = buildFormData({
        amount: "7,50",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: `${descriptionPrefix}-edited`,
        categoryId,
      });
      const result = await editTransaction(txnId, fd);
      expect(result.ok).toBe(true);

      const after = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txnId))
        .limit(1);
      expect(after[0]?.amountCents).toBe(750n);
      expect(after[0]?.descriptionRaw).toBe(`${descriptionPrefix}-edited`);
      expect(after[0]!.updatedAt.getTime()).toBeGreaterThan(beforeMs);
    });

    it("softDeleteTransaction sets soft_deleted_at to non-null", async () => {
      const result = await softDeleteTransaction(txnId);
      expect(result.ok).toBe(true);
      const row = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txnId))
        .limit(1);
      expect(row[0]?.softDeletedAt).not.toBeNull();
    });

    it("restoreTransaction clears soft_deleted_at back to NULL", async () => {
      await softDeleteTransaction(txnId);
      const result = await restoreTransaction(txnId);
      expect(result.ok).toBe(true);
      const row = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txnId))
        .limit(1);
      expect(row[0]?.softDeletedAt).toBeNull();
    });

    it("editTransaction rejects edits to soft-deleted rows (kind=not_found)", async () => {
      await softDeleteTransaction(txnId);
      const fd = buildFormData({
        amount: "8,00",
        bookingDate: new Date().toISOString().slice(0, 10),
        description: `${descriptionPrefix}-edited`,
        categoryId,
      });
      const result = await editTransaction(txnId, fd);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.kind).toBe("not_found");
    });
  },
);
