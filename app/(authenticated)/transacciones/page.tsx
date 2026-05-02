/**
 * /transacciones — list page (D-27 / D-28).
 *
 * Server Component that:
 *   1. Reads searchParams (q, min, max, desde, hasta, cat, pag, nuevo, editar).
 *   2. Validates each one defensively (Zod-equivalent inline parsers; T-02-20..23).
 *   3. Fetches the page in parallel with the category list and the QuickAddSheet
 *      defaults (last-used category, optional edit target).
 *   4. Renders header → Filters (Client) → TransactionList (RSC) → Pagination
 *      (Client) → QuickAddSheet (Client) — the Sheet is mounted unconditionally so
 *      ?nuevo=1 and ?editar={id} from the AddFab / RowActions reactively open it.
 *
 * Empty / error / loading copy is handled by:
 *   - TransactionList (empty branches, both filtered and pristine variants)
 *   - app/(authenticated)/transacciones/error.tsx (route-specific LIST-05 copy)
 *   - Suspense + Skeleton fallback (loading state)
 *
 * Threat-model mitigations (per <threat_model> in 02-06-PLAN.md):
 *   T-02-20 q.max(200) inline cap before passing to ilike()
 *   T-02-21 min/max parsed via parseEurInput; failures fall back to undefined
 *   T-02-22 cat: split by comma, each entry filtered by uuid regex
 *   T-02-23 pag: clamped to [1, 10000]
 *   T-02-24 description_raw rendered via JSX (auto-escaped) in TransactionList
 *
 * Caching: getTransactionsList is wrapped in unstable_cache (Plan 04). Server
 * Actions in actions/transactions.ts call updateTag('transactions') after every
 * write, so the page re-renders fresh on the next nav.
 */

import { Suspense } from "react";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, transactions } from "@/drizzle/schema";
import { getTransactionsList } from "@/lib/aggregates";
import { parseEurInput } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionList } from "./_components/TransactionList";
import { Filters } from "./_components/Filters";
import { Pagination } from "./_components/Pagination";
import { QuickAddSheet } from "./_components/QuickAddSheet";

export const metadata = {
  title: "Transacciones — Contabilidad Personal",
};

interface SearchParams {
  q?: string;
  min?: string;
  max?: string;
  desde?: string;
  hasta?: string;
  cat?: string;
  pag?: string;
  nuevo?: string;
  editar?: string;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function parseInputs(sp: SearchParams) {
  // T-02-20: hard cap on the search string length BEFORE handing to ilike().
  const q =
    typeof sp.q === "string" && sp.q.length > 0 ? sp.q.slice(0, 200) : undefined;

  // T-02-21: amount filters parsed via parseEurInput (handles Spanish commas);
  // any parse failure (NaN, garbage) falls back to undefined so the filter is
  // simply ignored — never throws into the request boundary.
  //
  // WR-CONT-01: returns cents-as-string (not bigint) so the result is
  // JSON-serializable and participates in `getTransactionsList`'s
  // `unstable_cache` auto-arg-hash (which throws on raw bigints). The impl
  // parses the string back to bigint just before issuing the SQL gte/lte.
  const safeCentsString = (v: unknown): string | undefined => {
    if (typeof v !== "string" || v.length === 0) return undefined;
    try {
      return parseEurInput(v).toString();
    } catch {
      return undefined;
    }
  };

  const safeDate = (v: unknown): Date | undefined => {
    if (typeof v !== "string") return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? undefined : d;
  };

  // T-02-22: comma-split, drop any non-UUID entry. inArray() is parameterized
  // downstream (Plan 04), so no SQL injection vector even if the regex were lax.
  const safeUuidArr = (v: unknown): string[] | undefined => {
    if (typeof v !== "string" || v.length === 0) return undefined;
    const ids = v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s));
    return ids.length > 0 ? ids : undefined;
  };

  // T-02-23: clamp page to [1, 10000]. Out-of-range or NaN → page 1.
  const pag = (() => {
    const n = Number(sp.pag);
    if (!Number.isFinite(n) || n < 1 || n > 10000) return 1;
    return Math.floor(n);
  })();

  return {
    q,
    min: safeCentsString(sp.min),
    max: safeCentsString(sp.max),
    desde: safeDate(sp.desde),
    hasta: safeDate(sp.hasta),
    cat: safeUuidArr(sp.cat),
    pag,
  };
}

/**
 * Fetch the full row needed by QuickAddSheet's edit-mode prefill. UUID is
 * regex-validated upstream so a malformed `?editar=...` short-circuits to null
 * and the sheet stays closed (Sheet `open={!!editar}` controls visibility).
 *
 * WR-NEW-04: filter out soft-deleted rows so this fetch matches
 * `editTransaction`'s WHERE-clause contract. Without this guard, a stale
 * `?editar={id}` URL (bookmark, back button, link from another tab) opens the
 * Sheet prefilled with the soft-deleted row's content; the user clicks
 * "Guardar cambios" → editTransaction returns kind:"not_found" because *its*
 * WHERE clause includes isNull(softDeletedAt). Aligning the read with the
 * write closes that "open then 404" loop — the sheet stays closed instead.
 */
async function fetchEditTarget(id: string) {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      bookingDate: transactions.bookingDate,
      descriptionRaw: transactions.descriptionRaw,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.softDeletedAt)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const date = r.bookingDate as Date;
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return {
    id: r.id,
    amountCents: BigInt(r.amountCents as unknown as string | number),
    bookingDate: `${yyyy}-${mm}-${dd}`,
    descriptionRaw: r.descriptionRaw,
    categoryId: r.categoryId,
  };
}

/**
 * Default category fallback chain (D-24):
 *   1. Last-used non-deleted manual category (most-recent imported_at).
 *   2. First 'expense' kind by sortOrder (deterministic seed-list head).
 *   3. null — no categories seeded; QuickAddSheet renders an unselected Select.
 */
async function defaultCategoryId(): Promise<string | null> {
  const lastUsed = await db
    .select({ categoryId: transactions.categoryId })
    .from(transactions)
    .where(isNull(transactions.softDeletedAt))
    .orderBy(desc(transactions.importedAt))
    .limit(1);
  if (lastUsed[0]?.categoryId) return lastUsed[0].categoryId;
  const firstExpense = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.kind, "expense"))
    .orderBy(categories.sortOrder)
    .limit(1);
  return firstExpense[0]?.id ?? null;
}

export default async function TransaccionesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const inputs = parseInputs(sp);

  // Parallel fetch — keeps TTFB low. The categories list is needed by both
  // Filters (Popover groups) and QuickAddSheet (kind-grouped Select).
  const [allCategories, listResult, defaultCat, editTarget] = await Promise.all([
    db.select().from(categories).orderBy(categories.sortOrder),
    getTransactionsList(inputs),
    defaultCategoryId(),
    sp.editar ? fetchEditTarget(sp.editar) : Promise.resolve(null),
  ]);

  const hasFilters = !!(
    inputs.q ||
    inputs.min !== undefined ||
    inputs.max !== undefined ||
    inputs.desde ||
    inputs.hasta ||
    inputs.cat
  );

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="text-xl font-semibold">Transacciones</h1>
      </header>

      <Filters categories={allCategories} />

      <Suspense
        fallback={
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        }
      >
        <TransactionList page={listResult} hasFilters={hasFilters} />
      </Suspense>

      <Pagination
        page={listResult.page}
        pageSize={listResult.pageSize}
        total={listResult.total}
      />

      {/*
        WR-NEW-03: force a remount of QuickAddSheet whenever the URL switches
        between add/edit targets. The Sheet's inputs use defaultValue (D-23
        uncontrolled-form pattern), so without a key React reuses the existing
        input nodes when ?editar=A → ?editar=B and the user sees row A's
        prefilled values while the sheet is labeled as editing row B.
        Submitting in that state would silently overwrite row B with row A's
        content — a data-corruption risk. Keying on `editar ?? "add"` makes
        React unmount/remount the Sheet on every target change, picking up
        the freshly-fetched editTarget cleanly.
      */}
      <QuickAddSheet
        key={sp.editar ?? "add"}
        categories={allCategories}
        defaultCategoryId={defaultCat}
        editTarget={editTarget}
      />
    </div>
  );
}
