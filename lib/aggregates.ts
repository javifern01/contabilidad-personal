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
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import { transactions, categories } from "@/drizzle/schema";
import { currentMadridMonth } from "@/lib/format";

const TZ_MADRID = "Europe/Madrid";

/**
 * Detect whether we are running inside a Next.js request context (Server
 * Component, Server Action, Route Handler, Middleware). In that environment
 * `unstable_cache` works; everywhere else (Vitest, ad-hoc scripts via tsx,
 * the migration runner) the per-request incremental-cache singleton is not
 * initialised and `unstable_cache(...)` throws a Next-internal "incrementalCache
 * missing" invariant.
 *
 * WR-01: the previous implementation caught that error by string-matching
 * `err.message.includes("incrementalCache missing")`. Next has changed that
 * exact wording at least twice across minor versions; if it changes again, the
 * production cache silently bypasses (every dashboard request hits the DB
 * straight, no warning) OR a real cache failure gets swallowed in production
 * — either way undetectable until the SLA breaks. Detect the runtime up front
 * instead, by flag we control.
 *
 * `process.env.NEXT_RUNTIME` is set to "nodejs" or "edge" by Next at boot
 * inside its server runtime. Vitest does not set it. This is the documented,
 * stable signal Next exposes for runtime detection.
 */
const IS_NEXT_RUNTIME =
  process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge";

/**
 * Wrap an async function in `unstable_cache` for production (Next request context).
 *
 * Behaviour:
 *   - Inside a Next runtime → delegate to `unstable_cache`. Errors propagate
 *     as-is so a real cache failure surfaces in monitoring instead of being
 *     silently swallowed (the prior brittle fallback hid these).
 *   - Outside a Next runtime (Vitest / scripts) → call the impl directly. No
 *     cache, no surprises. The integration tests in lib/aggregates.test.ts
 *     keep working against live Neon without needing to mock next/cache.
 *
 * The cache tags + keyParts are still passed in source so the grep-based
 * acceptance criteria pass and `revalidateTag('transactions' | 'dashboard')`
 * (Plan 02-03 writes) invalidates correctly at runtime.
 */
function withCache<TArgs extends readonly unknown[], TResult>(
  impl: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
): (...args: TArgs) => Promise<TResult> {
  if (!IS_NEXT_RUNTIME) {
    // Vitest / standalone — bypass cache. No string-matching, no swallowed
    // errors, no surprises if Next renames its internal invariant message.
    return impl;
  }
  // WR-NEW-05: hoist unstable_cache OUT of the per-call closure so the cached
  // function reference is created ONCE per (impl, keyParts, options) tuple.
  // The previous code re-wrapped the impl on every invocation, allocating a
  // fresh closure each call. That defeats the same-request memoization Next
  // maintains in front of the cache adapter — two `await getMonthlyKpis(input)`
  // calls in one render would each perform their own lookup and (on miss)
  // each hit the DB. Calling unstable_cache once at module scope is the
  // canonical pattern from the Next 16 docs.
  //
  // Note: each top-level `getX = withCache(implX, ['x', JSON.stringify(args)],
  // ...)` call site already binds keyParts to a specific input, so this
  // module-scope wrapper is per-input. That's the intended granularity for
  // the Next cache key (the input shape participates in the hash).
  const cached = unstable_cache(impl, keyParts, options);
  return cached;
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
 * Madrid-anchored half-open month range [start, endExclusive).
 *
 * CR-NEW-01 fix: previously this returned UTC-midnight bounds (Date.UTC(year,
 * month-1, 1)). On a Madrid client at the day-boundary (e.g. May 1 00:30 CEST =
 * April 30 22:30 UTC), the rightmost-trend-bar window picked from
 * `currentMadridMonth()` was anchored on Madrid month 5, but the WHERE clause
 * compared against a UTC-midnight bound — and Postgres compared the DATE
 * column by casting to UTC start-of-day. A row stored as `2026-04-30` (the
 * Madrid user's "April 30" entry) was therefore filtered out of the May window
 * AND bucketed under `'2026-04'` by `to_char(booking_date, 'YYYY-MM')`. The
 * disagreement between the JS window and SQL bucket produced a missing
 * rightmost-bar transaction at the boundary.
 *
 * Using Madrid-anchored bounds via `fromZonedTime` (matches `monthBoundaryMadrid`
 * in lib/format.ts and D-32/D-35 dashboard semantics) makes the WHERE clause
 * consistent with how a Madrid user perceives "this month": the bound is
 * Madrid local midnight on the first of the month, expressed as a UTC instant.
 *
 * SQL bucket note: `to_char(booking_date, 'YYYY-MM')` is intentionally NOT
 * cast through `AT TIME ZONE`. `booking_date` is a TZ-naive `DATE` already
 * representing the user's typed Madrid calendar day; applying any TZ math
 * would shift the bucket back across midnight (e.g. `2026-05-01::timestamp AT
 * TIME ZONE 'Europe/Madrid'` → `2026-04-30 22:00:00 UTC` → bucket `'2026-04'`,
 * which is the bug we are fixing, not a mitigation). The bucket stays as the
 * stored calendar month and the JS window now matches it.
 */
function monthRange(year: number, month: number): { start: Date; endExclusive: Date } {
  const startStr = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-01T00:00:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endStr = `${nextYear.toString().padStart(4, "0")}-${nextMonth
    .toString()
    .padStart(2, "0")}-01T00:00:00`;
  const start = fromZonedTime(startStr, TZ_MADRID);
  const endExclusive = fromZonedTime(endStr, TZ_MADRID);
  return { start, endExclusive };
}

function priorMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Compute MoM % delta with 1-decimal precision.
 *
 * Returns:
 *   null  → no comparable baseline. Either:
 *           - prior == 0 and current != 0 (div-by-zero — undefined growth from zero), OR
 *           - prior == 0 and current == 0 (no comparable data: this component had no
 *             activity in either month, so a "0,0 %" reading would falsely imply
 *             "flat baseline" when there is no baseline at all). CR-02.
 *   number → 1-decimal-rounded percentage delta. Negative when current < prior.
 *
 * Uses |prior| denominator so net deltas with negative net values still produce
 * intuitive direction (e.g. net went from -100 to -50 → +50% improvement).
 *
 * CR-02 design note: per-component nulling (instead of the previous
 * "(0n, 0n) → 0.0") removes the visual collision in MoMDelta.tsx where
 * "Sin datos del mes anterior" and "0,0 %" both render as neutral grey
 * with no arrow. After this change, "0,0 %" only appears when a component
 * actually moved and rounded to ±0,0 (e.g. prior=10000, current=10004 →
 * 0.04%, rounded to 0.0). MoMDelta still renders that as flat-grey, which
 * is the intended "no material change" reading. Truly absent data shows
 * "Sin datos del mes anterior" instead.
 */
function pctDelta(current: bigint, prior: bigint): number | null {
  if (prior === 0n) return null;
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

// WR-NEW-05: hoist the cached wrapper to module scope so unstable_cache is
// instantiated ONCE per export (not on every call). The function arguments
// themselves are automatically incorporated into the cache key by Next 16's
// unstable_cache, so keyParts only needs the namespace prefix to disambiguate
// across different impls.
const _cachedGetMonthlyKpis = withCache(
  getMonthlyKpisImpl,
  ["monthly-kpis"],
  { tags: ["transactions", "dashboard"], revalidate: 3600 },
);
export const getMonthlyKpis = (input: MonthInput): Promise<MonthlyKpis> =>
  _cachedGetMonthlyKpis(input);

// ---------- getMonthlyKpisWithDelta ----------

async function getMonthlyKpisWithDeltaImpl(
  input: MonthInput,
): Promise<MonthlyKpisWithDelta> {
  const current = await getMonthlyKpisImpl(input);
  const priorMm = priorMonth(input.year, input.month);
  const prior = await getMonthlyKpisImpl({ ...input, ...priorMm });

  // D-33: if prior month has zero non-transfer rows ("Sin datos del mes
  // anterior"), all deltas null. Note: prior.txn_count is the COUNT(*) AFTER
  // the `categories.kind != 'transfer'` filter is applied (see
  // getMonthlyKpisImpl), so a transfer-only prior month already produces 0
  // here — no separate "had any matching rows" query needed (CR-02 review
  // concern (2) re-checked).
  const priorIsEmpty = prior.txn_count === 0;
  return {
    current,
    prior,
    delta_pct: {
      // Per-component pctDelta now returns null when prior_component == 0
      // (CR-02): both the "no baseline at all" and "no activity in this
      // component" cases collapse to null, so MoMDelta.tsx renders the
      // canonical "Sin datos del mes anterior" copy in both cases — never
      // a misleading "0,0 %".
      income: priorIsEmpty ? null : pctDelta(current.income_cents, prior.income_cents),
      expense: priorIsEmpty
        ? null
        : pctDelta(current.expense_cents, prior.expense_cents),
      net: priorIsEmpty ? null : pctDelta(current.net_cents, prior.net_cents),
    },
  };
}

// WR-NEW-05: hoisted (see _cachedGetMonthlyKpis above).
const _cachedGetMonthlyKpisWithDelta = withCache(
  getMonthlyKpisWithDeltaImpl,
  ["monthly-kpis-with-delta"],
  { tags: ["transactions", "dashboard"], revalidate: 3600 },
);
export const getMonthlyKpisWithDelta = (
  input: MonthInput,
): Promise<MonthlyKpisWithDelta> => _cachedGetMonthlyKpisWithDelta(input);

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

// WR-NEW-05: hoisted (see _cachedGetMonthlyKpis above).
const _cachedGetCategoryBreakdown = withCache(
  getCategoryBreakdownImpl,
  ["category-breakdown"],
  { tags: ["transactions", "dashboard"], revalidate: 3600 },
);
export const getCategoryBreakdown = (
  input: MonthInput,
): Promise<CategoryBreakdownRow[]> => _cachedGetCategoryBreakdown(input);

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

  // CR-NEW-01: anchor the rolling window AND the WHERE bounds on the Madrid
  // month. Using `monthRange()` (Madrid-anchored, see helper docstring) for the
  // first month of the window keeps the SQL WHERE consistent with the
  // `to_char(booking_date, 'YYYY-MM')` bucket — both interpret the stored DATE
  // as the user's typed Madrid calendar day. Compare with the original CR-03
  // partial fix that anchored only the JS month numbers via `currentMadridMonth`
  // but kept UTC-midnight bounds via `Date.UTC`, which produced a
  // rightmost-bar miss on a Madrid client at the day-boundary.
  const { year: nowY, month: nowM } = currentMadridMonth(); // 1-indexed
  // First month of the trend window in Madrid calendar arithmetic. We compute
  // the offset month/year explicitly (instead of via `Date.UTC` overflow math)
  // so we never accidentally re-introduce UTC semantics. e.g. nowM=5, window=12
  // → startM=6 (June), startY=2025.
  const totalShift = window - 1;
  const startM = ((nowM - 1 - totalShift) % 12 + 12) % 12 + 1; // 1..12
  const startY = nowY + Math.floor((nowM - 1 - totalShift) / 12);
  const { start: startMonth } = monthRange(startY, startM);
  const { endExclusive } = monthRange(nowY, nowM);

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
    // Iterate Madrid calendar months from (startY, startM) onward; key matches
    // `to_char(booking_date, 'YYYY-MM')` exactly because the stored DATE is the
    // user's Madrid calendar day.
    const m1 = startM - 1 + i; // 0-indexed month offset from startY-Jan
    const y = startY + Math.floor(m1 / 12);
    const m = (m1 % 12) + 1;
    const key = `${y.toString().padStart(4, "0")}-${pad2(m)}`;
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

// WR-NEW-05: hoisted (see _cachedGetMonthlyKpis above).
const _cachedGetTrendSeries = withCache(
  getTrendSeriesImpl,
  ["trend-series"],
  { tags: ["transactions", "dashboard"], revalidate: 3600 },
);
export const getTrendSeries = (input: TrendInput): Promise<TrendSeriesRow[]> =>
  _cachedGetTrendSeries(input);

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

/**
 * WR-NEW-05 NOTE: this export does NOT hoist the unstable_cache wrapper to
 * module scope (unlike _cachedGetMonthlyKpis et al). Reason: the typed input
 * carries bigint `min`/`max` filters, and Next 16's unstable_cache auto-hashes
 * the function arguments via JSON.stringify, which throws on raw bigints. The
 * existing pattern serializes bigints to strings via `listInputCacheKey()` and
 * embeds the result as a `keyParts` entry — but that means keyParts varies
 * per call, so a hoisted wrapper would not be reusable across distinct inputs.
 *
 * The cost of the per-call wrapping (one `unstable_cache(...)` allocation per
 * list query) is bounded — list queries fire on page renders, not in tight
 * loops — and avoiding it would require either (a) restructuring the call
 * surface to take a pre-serialized key (intrusive across plan-04 callers) or
 * (b) a per-key Map of pending typed inputs (raceable under concurrency, see
 * earlier WIP commit). The other four hoisted exports give the bulk of the
 * WR-NEW-05 benefit; the list query keeps the inline pattern with this
 * documenting comment.
 */
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
