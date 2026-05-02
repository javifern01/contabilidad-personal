"use server";

/**
 * Manual transaction Server Actions (D-42).
 *
 * Exports four discriminated-union actions consumed by Plan 05 (form) and Plan 06
 * (list/edit UI):
 *   - addTransaction(formData)
 *   - editTransaction(id, formData)
 *   - softDeleteTransaction(id)
 *   - restoreTransaction(id)
 *
 * Security properties (per <threat_model> in 02-03-PLAN.md):
 * - T-02-07 (Elevation): every action verifies session via auth.api.getSession at
 *   entry. Missing session → server_error + log. NO env-gated bypass exists; tests
 *   inject a fake session via vi.mock("@/lib/auth").
 * - T-02-05/06 (Tampering / Info Disclosure): description is Zod-validated to
 *   z.string().min(1).max(200). description_raw is on the Pino redact list (FND-04)
 *   so production logs never expose it; pass it under exactly that key when logging.
 * - T-02-08 (Tampering): amount validated > 0n via parseEurInput refine; DB CHECK
 *   constraint `amount_cents > 0` is defense-in-depth (Plan 01).
 * - T-02-09 (Tampering): category_id FK rejects unknown UUIDs with Postgres 23503
 *   → translated to kind:"validation" with category_id field error.
 * - T-02-10 (DoS dedup retry storm): dedup_key is minute-bucketed (D-22) so only
 *   true double-clicks within 60s collide; surface is bounded.
 * - T-02-11 (Info Disclosure on dup-violation): the 23505 branch logs only
 *   { kind, account_id } — never description_raw.
 *
 * Cache invalidation (D-39):
 *   Every successful write calls revalidateTag('transactions') AND
 *   revalidateTag('dashboard'). Plan 04 aggregates wrap reads in unstable_cache
 *   with these tags so list/dashboard pages refresh on next render.
 *
 * Single-owner scope (D-04 / D-43):
 *   Phase 2 has one user (the owner). No row-level ownership column on transactions
 *   yet — the session check is sufficient at this scale. Phase 7 PRIV-02 handles
 *   multi-principal scoping when account-deletion ships.
 */

import { z } from "zod";
import { headers } from "next/headers";
// Next 16 split cache invalidation into:
//   - `updateTag(tag)`             — Server-Action mutations; read-your-own-writes
//   - `revalidateTag(tag, profile)` — non-Server-Action invalidation (mandatory profile)
// The legacy single-arg `revalidateTag(tag)` is deprecated at the type layer but
// still works at runtime (see node_modules/next/.../revalidate.js — only emits a
// runtime warning). For Server Action writes the canonical Next 16 call is updateTag.
//
// We import updateTag (and the legacy export-only revalidateTagLegacy alias for
// downstream non-action callers) and shadow them with a single-arg local
// `revalidateTag(tag)` so the four mutation paths read as
// `revalidateTag("transactions"); revalidateTag("dashboard");` per D-39 — matching
// the plan-spec'd invariant grep — while delegating to the correct Next 16 API.
import { updateTag, revalidateTag as revalidateTagLegacy } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { transactions, accounts } from "@/drizzle/schema";
import { parseEurInput } from "@/lib/format";
import { computeManualDedupKey } from "@/lib/dedup";

// ---------- Schemas (D-24) ----------

/**
 * Booking-date clamp per D-24: [today − 5y, today + 1d].
 * The +1d allows the user to enter a transaction "for tomorrow" once.
 */
function dateRange(): { earliest: Date; latest: Date } {
  const earliest = new Date();
  earliest.setFullYear(earliest.getFullYear() - 5);
  const latest = new Date();
  latest.setDate(latest.getDate() + 1);
  // Push latest to end-of-day so a UTC-midnight booking_date for "tomorrow"
  // (which the date input emits as YYYY-MM-DDT00:00:00Z) is accepted.
  latest.setHours(23, 59, 59, 999);
  return { earliest, latest };
}

const addTransactionSchema = z.object({
  amount: z
    .string()
    .min(1, { message: "El importe es obligatorio." })
    .max(20)
    .transform((s, ctx) => {
      try {
        const cents = parseEurInput(s);
        if (cents <= 0n) {
          ctx.addIssue({ code: "custom", message: "El importe debe ser positivo." });
          return z.NEVER;
        }
        return cents;
      } catch {
        ctx.addIssue({ code: "custom", message: "Importe no válido." });
        return z.NEVER;
      }
    }),
  booking_date: z.coerce.date().refine(
    (d) => {
      const { earliest, latest } = dateRange();
      return d >= earliest && d <= latest;
    },
    { message: "Fecha fuera de rango." },
  ),
  description: z
    .string()
    .min(1, { message: "La descripción es obligatoria." })
    .max(200, { message: "La descripción no puede superar los 200 caracteres." }),
  category_id: z.string().uuid({ message: "Categoría no válida." }),
  account_id: z.string().uuid().optional(),
});

const idSchema = z.string().uuid({ message: "ID no válido." });

// ---------- Result types (D-42) ----------

export type AddTransactionResult =
  | { ok: true; id: string }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "duplicate" }
  | { ok: false; kind: "server_error" };

export type EditTransactionResult =
  | { ok: true }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "server_error" };

export type SoftDeleteResult =
  | { ok: true }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "server_error" };

export type RestoreResult = SoftDeleteResult;

// ---------- Helpers ----------

/**
 * T-02-07 mitigation: real session check on every action call. NO env bypass.
 * Tests inject a session via vi.mock("@/lib/auth") at the top of the test file.
 */
async function ensureSession(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return !!session;
  } catch {
    return false;
  }
}

/**
 * Phase 2: only one account exists ('Efectivo' seed row per D-19). The form
 * does not show an account picker yet, so when account_id is omitted we resolve
 * to the seeded default. Phase 4 introduces the picker once multiple accounts
 * exist (PSD2-connected banks).
 */
async function defaultAccountId(): Promise<string> {
  const rows = await db.select({ id: accounts.id }).from(accounts).limit(1);
  if (rows.length === 0) throw new Error("No account seeded — run db:migrate");
  return rows[0]!.id;
}

/**
 * Drizzle's neon-http driver wraps Neon errors in a `DrizzleQueryError` whose
 * `.cause` is the underlying `NeonDbError` carrying the SQLSTATE `code`. Walk
 * the cause chain (max 3 hops as a safety bound) and check each link for the
 * expected SQLSTATE code.
 */
function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    if ("code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string") return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

function isFkViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23503";
}

/**
 * Single-arg cache-invalidation wrapper used by the four mutation paths.
 *
 * D-39 specifies that every successful write calls `revalidateTag('transactions')`
 * AND `revalidateTag('dashboard')` so Plan 04 aggregates wrapped in
 * `unstable_cache` (with those tags) refresh on next render.
 *
 * Next 16 split the legacy single-arg `revalidateTag` into a Server-Action API
 * (`updateTag`) and a generic API (`revalidateTag(tag, profile)`). Inside Server
 * Actions, `updateTag` is the canonical call — it provides read-your-own-writes
 * semantics that the legacy form lacks. This wrapper preserves the D-39 spelling
 * at the call sites while delegating to the correct Next 16 primitive.
 */
function revalidateTag(tag: string): void {
  updateTag(tag);
}

// Re-export the legacy two-arg form under its real name so non-Server-Action
// callers (future cron handlers, webhook routes) still have a way to invalidate
// without re-importing from next/cache.
export { revalidateTagLegacy as revalidateTagRoute };

// ---------- Actions ----------

export async function addTransaction(formData: FormData): Promise<AddTransactionResult> {
  if (!(await ensureSession())) {
    logger.error({}, "transactions_add_no_session");
    return { ok: false, kind: "server_error" };
  }

  const parsed = addTransactionSchema.safeParse({
    amount: formData.get("amount"),
    booking_date: formData.get("booking_date"),
    description: formData.get("description"),
    category_id: formData.get("category_id"),
    account_id: formData.get("account_id") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { amount, booking_date, description, category_id } = parsed.data;
  const account_id = parsed.data.account_id ?? (await defaultAccountId());

  const dedupKey = computeManualDedupKey({
    accountId: account_id,
    bookingDate: booking_date,
    amountCents: amount,
    description,
    anchorMs: Date.now(),
  });

  try {
    const inserted = await db
      .insert(transactions)
      .values({
        accountId: account_id,
        dedupKey,
        bookingDate: booking_date,
        amountCents: amount,
        // Phase 2 is EUR-only manual; amount_eur_cents == amount_cents.
        // Phase 4 PSD2 may carry foreign currencies and recompute fx_rate.
        amountEurCents: amount,
        originalCurrency: "EUR",
        descriptionRaw: description,
        categoryId: category_id,
        categorySource: "manual",
        source: "manual",
      })
      .returning({ id: transactions.id });

    if (inserted.length === 0) {
      logger.error({}, "transactions_add_no_returning");
      return { ok: false, kind: "server_error" };
    }

    revalidateTag("transactions");
    revalidateTag("dashboard");
    // description_raw is on the Pino redact list — passing it under that exact
    // key triggers the redaction rule in production logs.
    logger.info(
      { id: inserted[0]!.id, kind: "transaction_added", description_raw: description },
      "transaction_added",
    );

    return { ok: true, id: inserted[0]!.id };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      // T-02-11: dup-collision branch logs neither description_raw nor amount_cents bare.
      logger.info({ kind: "duplicate", account_id }, "transaction_duplicate_rejected");
      return { ok: false, kind: "duplicate" };
    }
    if (isFkViolation(err)) {
      return {
        ok: false,
        kind: "validation",
        fieldErrors: { category_id: ["Categoría no válida."] },
      };
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "transactions_add_server_error",
    );
    return { ok: false, kind: "server_error" };
  }
}

export async function editTransaction(
  id: string,
  formData: FormData,
): Promise<EditTransactionResult> {
  if (!(await ensureSession())) {
    logger.error({}, "transactions_edit_no_session");
    return { ok: false, kind: "server_error" };
  }

  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) {
    return {
      ok: false,
      kind: "validation",
      fieldErrors: { id: idCheck.error.flatten().formErrors },
    };
  }

  const parsed = addTransactionSchema.safeParse({
    amount: formData.get("amount"),
    booking_date: formData.get("booking_date"),
    description: formData.get("description"),
    category_id: formData.get("category_id"),
    account_id: formData.get("account_id") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { amount, booking_date, description, category_id } = parsed.data;

  try {
    // The `isNull(softDeletedAt)` clause makes this a no-op for soft-deleted rows;
    // the .returning empty result then surfaces as kind:"not_found" per D-42.
    const updated = await db
      .update(transactions)
      .set({
        amountCents: amount,
        amountEurCents: amount,
        bookingDate: booking_date,
        descriptionRaw: description,
        categoryId: category_id,
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, id), isNull(transactions.softDeletedAt)))
      .returning({ id: transactions.id });

    if (updated.length === 0) {
      return { ok: false, kind: "not_found" };
    }

    revalidateTag("transactions");
    revalidateTag("dashboard");
    logger.info(
      { id, kind: "transaction_edited", description_raw: description },
      "transaction_edited",
    );
    return { ok: true };
  } catch (err: unknown) {
    if (isFkViolation(err)) {
      return {
        ok: false,
        kind: "validation",
        fieldErrors: { category_id: ["Categoría no válida."] },
      };
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err), id },
      "transactions_edit_server_error",
    );
    return { ok: false, kind: "server_error" };
  }
}

export async function softDeleteTransaction(id: string): Promise<SoftDeleteResult> {
  if (!(await ensureSession())) {
    logger.error({}, "transactions_soft_delete_no_session");
    return { ok: false, kind: "server_error" };
  }
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, kind: "not_found" };

  try {
    // Only operate on rows that are not already soft-deleted, so a re-deletion
    // returns kind:"not_found" rather than silently bumping updated_at.
    const updated = await db
      .update(transactions)
      .set({ softDeletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(transactions.id, id), isNull(transactions.softDeletedAt)))
      .returning({ id: transactions.id });

    if (updated.length === 0) return { ok: false, kind: "not_found" };

    revalidateTag("transactions");
    revalidateTag("dashboard");
    logger.info({ id, kind: "transaction_soft_deleted" }, "transaction_soft_deleted");
    return { ok: true };
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), id },
      "transactions_soft_delete_server_error",
    );
    return { ok: false, kind: "server_error" };
  }
}

export async function restoreTransaction(id: string): Promise<RestoreResult> {
  if (!(await ensureSession())) {
    logger.error({}, "transactions_restore_no_session");
    return { ok: false, kind: "server_error" };
  }
  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { ok: false, kind: "not_found" };

  try {
    // No `isNull` guard here — restore must succeed regardless of current
    // soft_deleted_at state (idempotent restore).
    const updated = await db
      .update(transactions)
      .set({ softDeletedAt: null, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning({ id: transactions.id });

    if (updated.length === 0) return { ok: false, kind: "not_found" };

    revalidateTag("transactions");
    revalidateTag("dashboard");
    logger.info({ id, kind: "transaction_restored" }, "transaction_restored");
    return { ok: true };
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), id },
      "transactions_restore_server_error",
    );
    return { ok: false, kind: "server_error" };
  }
}
