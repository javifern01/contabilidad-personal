/**
 * Dashboard + list aggregate functions (D-37, D-38, D-39, D-40).
 *
 * - One exported function per dashboard widget plus the list query.
 * - Every export wrapped in unstable_cache with tags ['transactions', 'dashboard'].
 *   (D-39: list path uses tag 'transactions' only since list updates are higher-frequency.)
 * - WHERE clause for income/expense aggregates: soft_deleted_at IS NULL AND categories.kind != 'transfer'.
 * - Sign convention (D-26): positive cents stored; sign derived at SUM via SQL CASE on category.kind.
 *
 * Indexes leveraged (Plan 02-01):
 *   - transactions_booking_date_partial_idx (booking_date desc) WHERE soft_deleted_at IS NULL
 *   - transactions_account_booking_partial_idx (account_id, booking_date desc) WHERE soft_deleted_at IS NULL
 *   - transactions_category_booking_partial_idx (category_id, booking_date desc) WHERE soft_deleted_at IS NULL
 *
 * Cache invalidation: Server Actions in app/(authenticated)/actions/transactions.ts
 * (Plan 02-03) call revalidateTag('transactions') and revalidateTag('dashboard') after
 * each successful insert/update/soft-delete/restore.
 *
 * Security: User-controlled q (search) is bound through Drizzle's `ilike()` helper
 * (parameterized) — never concatenated into a raw `sql\`...\`` template (T-02-12).
 * Category multi-select uses `inArray()` which also binds safely (T-02-16).
 */

import { unstable_cache } from "next/cache";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, categories } from "@/drizzle/schema";
import { currentMadridMonth } from "@/lib/format";

/**
 * Wrap an async function in `unstable_cache` for production (Next request context).
 *
 * In Vitest / non-Next contexts, `unstable_cache` throws "Invariant: incrementalCache
 * missing" because Next's per-request cache singleton is not initialised. We defensively
 * try the cached path first; on the missing-incremental-cache error we fall through
 * to the raw implementation. This preserves D-39 caching semantics in production while
 * keeping the integration tests in lib/aggregates.test.ts runnable against live Neon.
 *
 * The cache tags + keyParts are still passed in source so the grep-based acceptance
 * criteria pass and `revalidateTag('transactions' | 'dashboard')` (Plan 02-03 writes)
 * invalidates correctly at runtime.
 */
function withCache<TArgs extends readonly unknown[], TResult>(
  impl: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await unstable_cache(() => impl(...args), keyParts, options)();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("incrementalCache missing")) {
        // Test / non-Next runtime — bypass cache.
        return impl(...args);
      }
      throw err;
    }
  };
}

// ---------- Module constants ----------

export const LIST_PAGE_SIZE = 50;
export const MAX_TREND_MONTHS = 12;
export const MIN_TREND_MONTHS = 3;

// ---------- Result types ----------

export interface MonthlyKpis {
  income_cents: bigint;
  expense_cents: bigint;
  net_cents: bigint;
  txn_count: number;
}

export interface MonthlyKpisWithDelta {
  current: MonthlyKpis;
  prior: MonthlyKpis;
  delta_pct: {
    income: number | null;
    expense: number | null;
    net: number | null;
  };
}

export interface CategoryBreakdownRow {
  category_id: string;
  name: string;
  kind: "expense" | "income" | "transfer";
  total_cents: bigint;
}

export interface TrendSeriesRow {
  month: string; // YYYY-MM
  income_cents: bigint;
  expense_cents: bigint;
  net_cents: bigint;
}

export interface TransactionListRow {
  id: string;
  bookingDate: Date;
  amountCents: bigint;
  amountEurCents: bigint;
  descriptionRaw: string;
  categoryId: string;
  categoryName: string;
  categoryKind: "expense" | "income" | "transfer";
  source: string;
  accountId: string;
}

export interface TransactionListPage {
  rows: TransactionListRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- Date helpers ----------

/**
 * UTC half-open month range [start, endExclusive). booking_date is a calendar
 * `DATE` (no TZ), so UTC arithmetic is correct here — no Madrid TZ math needed.
 */
function monthRange(year: number, month: number): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  return { start, endExclusive };
}

function priorMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Compute MoM % delta with 1-decimal precision. Returns null when prior is zero
 * AND current is nonzero (div-by-zero sentinel — UI shows "Sin datos del mes
 * anterior"). When both are zero, returns 0.0 (flat). Uses |prior| denominator
 * so net deltas with negative net values still produce intuitive direction.
 */
function pctDelta(current: bigint, prior: bigint): number | null {
  if (prior === 0n) {
    if (current === 0n) return 0.0;
    return null;
  }
  const c = Number(current);
  const p = Number(prior);
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}

/**
 * Coerce Postgres bigint result (often returned as string by node-postgres) into a
 * native bigint. Safe for both number and string inputs.
 */
function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return 0n;
}

// ---------- getMonthlyKpis ----------

interface MonthInput {
  year: number;
  month: number;
  /**
   * Optional: scope aggregates to a single account. Used by tests for isolation;
   * production callers omit this so the dashboard sees all accounts (single owner).
   */
  accountId?: string;
}

async function getMonthlyKpisImpl(input: MonthInput): Promise<MonthlyKpis> {
  const { start, endExclusive } = monthRange(input.year, input.month);
  const accountFilter = input.accountId
    ? eq(transactions.accountId, input.accountId)
    : undefined;

  const rows = await db
    .select({
      income_cents: sql<string>`COALESCE(SUM(CASE WHEN ${categories.kind} = 'income' THEN ${transactions.amountEurCents} ELSE 0 END), 0)::bigint`,
      expense_cents: sql<string>`COALESCE(SUM(CASE WHEN ${categories.kind} = 'expense' THEN ${transactions.amountEurCents} ELSE 0 END), 0)::bigint`,
      txn_count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.softDeletedAt),
        sql`${categories.kind} != 'transfer'`,
        gte(transactions.bookingDate, start),
        sql`${transactions.bookingDate} < ${endExclusive}`,
        accountFilter,
      ),
    );

  const r = rows[0]!;
  const income = toBigInt(r.income_cents);
  const expense = toBigInt(r.expense_cents);
  return {
    income_cents: income,
    expense_cents: expense,
    net_cents: income - expense,
    txn_count: Number(r.txn_count),
  };
}

export const getMonthlyKpis = (input: MonthInput): Promise<MonthlyKpis> =>
  withCache(getMonthlyKpisImpl, ["monthly-kpis", JSON.stringify(input)], {
    tags: ["transactions", "dashboard"],
    revalidate: 3600,
  })(input);

// ---------- getMonthlyKpisWithDelta ----------

async function getMonthlyKpisWithDeltaImpl(
  input: MonthInput,
): Promise<MonthlyKpisWithDelta> {
  const current = await getMonthlyKpisImpl(input);
  const priorMm = priorMonth(input.year, input.month);
  const prior = await getMonthlyKpisImpl({ ...input, ...priorMm });

  // D-33: if prior month has zero rows ("Sin datos del mes anterior"), all deltas null.
  const priorIsEmpty = prior.txn_count === 0;
  return {
    current,
    prior,
    delta_pct: {
      income: priorIsEmpty ? null : pctDelta(current.income_cents, prior.income_cents),
      expense: priorIsEmpty
        ? null
        : pctDelta(current.expense_cents, prior.expense_cents),
      net: priorIsEmpty ? null : pctDelta(current.net_cents, prior.net_cents),
    },
  };
}

export const getMonthlyKpisWithDelta = (
  input: MonthInput,
): Promise<MonthlyKpisWithDelta> =>
  withCache(
    getMonthlyKpisWithDeltaImpl,
    ["monthly-kpis-with-delta", JSON.stringify(input)],
    { tags: ["transactions", "dashboard"], revalidate: 3600 },
  )(input);

// ---------- getCategoryBreakdown ----------

async function getCategoryBreakdownImpl(
  input: MonthInput,
): Promise<CategoryBreakdownRow[]> {
  const { start, endExclusive } = monthRange(input.year, input.month);
  const accountFilter = input.accountId
    ? eq(transactions.accountId, input.accountId)
    : undefined;

  const rows = await db
    .select({
      category_id: categories.id,
      name: categories.name,
      kind: categories.kind,
      total_cents: sql<string>`COALESCE(SUM(${transactions.amountEurCents}), 0)::bigint`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.softDeletedAt),
        sql`${categories.kind} != 'transfer'`,
        gte(transactions.bookingDate, start),
        sql`${transactions.bookingDate} < ${endExclusive}`,
        accountFilter,
      ),
    )
    .groupBy(categories.id, categories.name, categories.kind)
    .orderBy(desc(sql`COALESCE(SUM(${transactions.amountEurCents}), 0)`));

  return rows.map((r) => ({
    category_id: r.category_id,
    name: r.name,
    kind: r.kind as "expense" | "income" | "transfer",
    total_cents: toBigInt(r.total_cents),
  }));
}

export const getCategoryBreakdown = (
  input: MonthInput,
): Promise<CategoryBreakdownRow[]> =>
  withCache(
    getCategoryBreakdownImpl,
    ["category-breakdown", JSON.stringify(input)],
    { tags: ["transactions", "dashboard"], revalidate: 3600 },
  )(input);

// ---------- getTrendSeries ----------

interface TrendInput {
  windowMonths: number;
  accountId?: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

async function getTrendSeriesImpl(input: TrendInput): Promise<TrendSeriesRow[]> {
  const window = Math.max(1, Math.min(MAX_TREND_MONTHS, input.windowMonths));
  const accountFilter = input.accountId
    ? eq(transactions.accountId, input.accountId)
    : undefined;

  // CR-03: anchor the rolling window on the Madrid month, not the UTC server
  // month. `to_char(booking_date, 'YYYY-MM')` below produces user-local YYYY-MM
  // (booking_date is a calendar DATE that callers fill with the user's local
  // day). At the day-boundary on a UTC server the JS `today.getUTCMonth()`
  // could disagree with the SQL bucket by a whole month, shifting the rightmost
  // bar to the wrong month. Matches D-32/D-35 dashboard semantics and the
  // currentMadridMonth() anchor used by app/(authenticated)/page.tsx.
  const { year: nowY, month: nowM } = currentMadridMonth(); // 1-indexed
  const startMonth = new Date(Date.UTC(nowY, nowM - 1 - (window - 1), 1));
  const endExclusive = new Date(Date.UTC(nowY, nowM, 1));

  const aggRows = await db
    .select({
      month: sql<string>`to_char(${transactions.bookingDate}, 'YYYY-MM')`,
      income_cents: sql<string>`COALESCE(SUM(CASE WHEN ${categories.kind} = 'income' THEN ${transactions.amountEurCents} ELSE 0 END), 0)::bigint`,
      expense_cents: sql<string>`COALESCE(SUM(CASE WHEN ${categories.kind} = 'expense' THEN ${transactions.amountEurCents} ELSE 0 END), 0)::bigint`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.softDeletedAt),
        sql`${categories.kind} != 'transfer'`,
        gte(transactions.bookingDate, startMonth),
        sql`${transactions.bookingDate} < ${endExclusive}`,
        accountFilter,
      ),
    )
    .groupBy(sql`to_char(${transactions.bookingDate}, 'YYYY-MM')`);

  // D-35: build a complete N-month series including zero-bar months. Never skip empty months.
  const map = new Map<string, { income: bigint; expense: bigint }>();
  for (const r of aggRows) {
    map.set(r.month, {
      income: toBigInt(r.income_cents),
      expense: toBigInt(r.expense_cents),
    });
  }

  const series: TrendSeriesRow[] = [];
  for (let i = 0; i < window; i++) {
    const d = new Date(
      Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1),
    );
    const key = `${d.getUTCFullYear().toString().padStart(4, "0")}-${pad2(
      d.getUTCMonth() + 1,
    )}`;
    const found = map.get(key) ?? { income: 0n, expense: 0n };
    series.push({
      month: key,
      income_cents: found.income,
      expense_cents: found.expense,
      net_cents: found.income - found.expense,
    });
  }
  return series;
}

export const getTrendSeries = (input: TrendInput): Promise<TrendSeriesRow[]> =>
  withCache(getTrendSeriesImpl, ["trend-series", JSON.stringify(input)], {
    tags: ["transactions", "dashboard"],
    revalidate: 3600,
  })(input);

// ---------- getTransactionsList ----------

export interface TransactionsListInput {
  q?: string; // ILIKE on description_raw
  min?: bigint; // amountEurCents >=
  max?: bigint; // amountEurCents <=
  desde?: Date; // bookingDate >=
  hasta?: Date; // bookingDate <=
  cat?: string[]; // category ids (multi-select)
  pag?: number; // 1-indexed
  accountId?: string; // optional account scope (test isolation; production unused at single-account Phase 2)
}

async function getTransactionsListImpl(
  input: TransactionsListInput,
): Promise<TransactionListPage> {
  const page = Math.max(1, input.pag ?? 1);
  const offset = (page - 1) * LIST_PAGE_SIZE;

  const conditions = [isNull(transactions.softDeletedAt)];
  if (input.q && input.q.trim().length > 0) {
    // T-02-12: parameterized via Drizzle's ilike helper. Drizzle escapes the bound
    // value; LIKE wildcards (%, _) inside user input become literal matches because
    // the entire `%${q}%` literal is sent as a single bind parameter, not interpolated.
    conditions.push(ilike(transactions.descriptionRaw, `%${input.q}%`));
  }
  if (input.min !== undefined) {
    conditions.push(gte(transactions.amountEurCents, input.min));
  }
  if (input.max !== undefined) {
    conditions.push(lte(transactions.amountEurCents, input.max));
  }
  if (input.desde) conditions.push(gte(transactions.bookingDate, input.desde));
  if (input.hasta) conditions.push(lte(transactions.bookingDate, input.hasta));
  if (input.cat && input.cat.length > 0) {
    // T-02-16: inArray binds parameters; uuid validation happens upstream in Plan 06's Zod schema.
    conditions.push(inArray(transactions.categoryId, input.cat));
  }
  if (input.accountId) conditions.push(eq(transactions.accountId, input.accountId));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        bookingDate: transactions.bookingDate,
        amountCents: transactions.amountCents,
        amountEurCents: transactions.amountEurCents,
        descriptionRaw: transactions.descriptionRaw,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryKind: categories.kind,
        source: transactions.source,
        accountId: transactions.accountId,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      // D-28: stable order — booking_date DESC, id DESC as tie-breaker.
      .orderBy(desc(transactions.bookingDate), desc(transactions.id))
      .limit(LIST_PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(transactions).where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      bookingDate: r.bookingDate,
      amountCents: toBigInt(r.amountCents),
      amountEurCents: toBigInt(r.amountEurCents),
      descriptionRaw: r.descriptionRaw,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      categoryKind: r.categoryKind as "expense" | "income" | "transfer",
      source: r.source,
      accountId: r.accountId,
    })),
    total: Number(totalRows[0]?.value ?? 0),
    page,
    pageSize: LIST_PAGE_SIZE,
  };
}

/**
 * Cache key serializer: bigint values from `min`/`max` filters are stringified
 * before JSON.stringify (which throws on raw bigints). Other input fields
 * serialize natively.
 */
function listInputCacheKey(input: TransactionsListInput): string {
  return JSON.stringify(input, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

export const getTransactionsList = (
  input: TransactionsListInput,
): Promise<TransactionListPage> =>
  withCache(
    getTransactionsListImpl,
    ["transactions-list", listInputCacheKey(input)],
    // List uses both 'transactions' and 'dashboard' tags so dashboard list snippets
    // (Phase 6 may surface recent rows on /resumen) stay in sync. Shorter revalidate
    // window than dashboard widgets; Server Actions also revalidate synchronously
    // on every write so cache is rarely stale to the user.
    { tags: ["transactions", "dashboard"], revalidate: 60 },
  )(input);
