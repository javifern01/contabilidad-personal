---
phase: 02-manual-tracker-mvp
reviewed: 2026-05-02T12:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - app/(authenticated)/_components/AddFab.tsx
  - app/(authenticated)/_components/CategoryBarChart.tsx
  - app/(authenticated)/_components/KpiCards.tsx
  - app/(authenticated)/_components/MobileBottomNav.tsx
  - app/(authenticated)/_components/MoMDelta.tsx
  - app/(authenticated)/_components/MonthlyTrendChart.tsx
  - app/(authenticated)/_components/MonthPicker.tsx
  - app/(authenticated)/_components/TopNav.tsx
  - app/(authenticated)/actions/transactions.ts
  - app/(authenticated)/actions/transactions.test.ts
  - app/(authenticated)/layout.tsx
  - app/(authenticated)/page.tsx
  - app/(authenticated)/transacciones/_components/CategorySelect.tsx
  - app/(authenticated)/transacciones/_components/Filters.tsx
  - app/(authenticated)/transacciones/_components/Pagination.tsx
  - app/(authenticated)/transacciones/_components/QuickAddSheet.tsx
  - app/(authenticated)/transacciones/_components/RowActions.tsx
  - app/(authenticated)/transacciones/_components/SourceBadge.tsx
  - app/(authenticated)/transacciones/_components/TransactionList.tsx
  - app/(authenticated)/transacciones/error.tsx
  - app/(authenticated)/transacciones/page.tsx
  - app/layout.tsx
  - components/ui/badge.tsx
  - components/ui/checkbox.tsx
  - components/ui/popover.tsx
  - components/ui/select.tsx
  - components/ui/sheet.tsx
  - components/ui/skeleton.tsx
  - components/ui/table.tsx
  - components/ui/tabs.tsx
  - drizzle/migrations/0001_phase2_transactions.sql
  - drizzle/schema.ts
  - lib/aggregates.ts
  - lib/aggregates.test.ts
  - lib/dedup.ts
  - lib/dedup.test.ts
  - lib/format.ts
  - lib/format.test.ts
  - scripts/migrate.ts
  - scripts/seed-categories.ts
  - tests/e2e/dashboard.spec.ts
  - tests/e2e/fixtures.ts
  - tests/e2e/transactions.spec.ts
findings:
  critical: 3
  warning: 9
  info: 6
  total: 18
status: issues_found
summary:
  critical: 3
  warning: 9
  info: 6
  total: 18
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-02T12:00:00Z
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

Phase 2 ships a substantial vertical slice (manual transactions CRUD, list with filters/pagination, dashboard with KPIs/charts, integration + E2E tests). Overall code quality is high: PII redaction discipline is followed, money is uniformly handled as `bigint` cents, queries are parameterised through Drizzle, soft-delete filters appear in every aggregate, and Spanish copy is mostly verbatim from CONTEXT.

However, the adversarial review surfaces three **BLOCKER**-class defects that contradict the phase's own success criteria and threat model:

1. **Authorization gap on `editTransaction` / `softDeleteTransaction` / `restoreTransaction`** — none of these enforce the "row not yet soft-deleted" check via `idSchema` correctly: `softDeleteTransaction(id)` returns `kind:"not_found"` when the UUID is malformed, but `restoreTransaction(id)` does the same — and `restoreTransaction` then `UPDATE`s any matching id without verifying the row is actually deleted. Combined with the `addTransactionSchema.account_id` being honoured on insert with no ownership check, an attacker who guesses any account UUID can write transactions to it (Phase 2 has only one owner, so the practical risk is limited, but the threat-model claim T-02-07 is overstated).
2. **`MoMDelta` flat/empty branches collide on `delta === 0`** — when the prior month is empty AND the current is also empty, `pctDelta` returns `0.0` (the "flat" sentinel) rather than `null`, so the UI shows "0,0 %" instead of "Sin datos del mes anterior". The component hides this because the dashboard short-circuits via `priorIsEmpty`, but `getMonthlyKpisWithDelta` only treats `txn_count===0` as "empty"; if prior month has e.g. one transfer-only row (transfers excluded from sums), `txn_count` is non-zero but income/expense are both `0n`, producing a misleading "0,0 %" delta. A subtler version: prior=current=0 returns 0.0 even when the prior is genuinely zero.
3. **`getTrendSeries` window math uses UTC instead of Madrid time** — `today.getUTCMonth()` is used to compute the rolling 12-month window. For ~2 hours each summer day (and ~1 hour each winter day) the user's Madrid date and the server's UTC date disagree, shifting the trend window by a whole month at the boundary. Combined with `to_char(booking_date, 'YYYY-MM')` (calendar-date arithmetic, no TZ), the dashboard can show "May" as the leftmost bar when the user expects "June" (or vice versa). CONTEXT D-32/D-35 specify Madrid-month semantics; this is a regression of the timezone discipline used elsewhere (see `formatMonthEs`, `currentMadridMonth`, `monthBoundaryMadrid`).

Plus a number of WARNING-level defects: a brittle string-match cache fallback that will silently bypass production caching when Next changes its error message; an `editTransaction` that ignores form-supplied `account_id` silently rather than rejecting it; route-level `error.tsx` E2E test that asserts `true` (always passes); a search-input bound only via `defaultValue` so URL→input sync after navigation breaks; and several validation/UX edge-cases.

The Phase 1 D-14 PII redaction discipline (no `iban`/`description_raw` in logs) is correctly applied. SQL injection surface is closed by Drizzle's bound parameters everywhere, including the `ilike()` and `inArray()` paths called out in T-02-12 / T-02-16. CSP / XSS surface is closed by React JSX auto-escaping (no `dangerouslySetInnerHTML` in the diff).

## Critical Issues

### CR-01: `editTransaction` accepts `account_id` from form data and silently drops it (data-integrity / UX surprise)

**File:** `app/(authenticated)/actions/transactions.ts:319-352`
**Issue:** `editTransaction` runs `addTransactionSchema.safeParse({ ..., account_id: formData.get("account_id") || undefined })` — accepting an `account_id` UUID from the form — but the subsequent `db.update(transactions).set({...})` call deliberately omits `accountId`. The supplied value is silently discarded. Worse, the **`dedup_key` is never recomputed on edit**, so an edit that changes amount, date, OR description leaves the row's `dedup_key` pointing at the OLD content. A subsequent identical add (matching the new content) will succeed (no collision against the stale key), violating the D-22 dedup contract for the post-edit state. The dedup unique index is now effectively a stored hash of obsolete data.
**Fix:**
```typescript
// After validation, recompute dedup_key with the new content:
const newDedupKey = computeManualDedupKey({
  accountId: existingRow.accountId, // fetched in a SELECT before UPDATE
  bookingDate: booking_date,
  amountCents: amount,
  description,
  anchorMs: Date.now(),
});

const updated = await db
  .update(transactions)
  .set({
    amountCents: amount,
    amountEurCents: amount,
    bookingDate: booking_date,
    descriptionRaw: description,
    categoryId: category_id,
    dedupKey: newDedupKey, // <-- add this
    updatedAt: new Date(),
  })
  .where(and(eq(transactions.id, id), isNull(transactions.softDeletedAt)))
  .returning({ id: transactions.id });
```
And remove `account_id` from `addTransactionSchema` (or fork an `editTransactionSchema` that omits it) so the API surface does not lie about what fields are honoured. If a unique-violation lands during edit, return `kind:"duplicate"` to the caller rather than `kind:"server_error"`.

---

### CR-02: `MoMDelta` empty-state collides with the "prior=0, current=0" branch and misleads the user

**File:** `lib/aggregates.ts:154-162` and `app/(authenticated)/_components/MoMDelta.tsx:31-39`
**Issue:** Two interacting bugs produce a misleading 0,0 % delta in real scenarios:

1. `pctDelta(0n, 0n) === 0.0` (flat). This is correct *only* when both months were genuinely active and ended at zero net — but the function cannot distinguish "no activity" from "activity that summed to zero".
2. `getMonthlyKpisWithDeltaImpl` decides "prior is empty" using `prior.txn_count === 0`. But `txn_count` is `COUNT(*)` over rows after the `kind != 'transfer'` filter — so a prior month containing **only transfers** (which are excluded from KPIs but still real transactions) yields `txn_count = 0` and the dashboard claims "Sin datos del mes anterior" when the user did, in fact, record activity. Conversely, a prior month with **one income row that was soft-deleted later** could leave the prior table state inconsistent with the displayed delta if cache isn't invalidated cleanly.
3. More importantly: when prior month had real income/expense rows but their net summed to exactly the same as the current month's, `pctDelta` returns `0.0`, and the UI renders "0,0 %" with `text-slate-500` and **no arrow**, indistinguishable from the "no movement at all" state. CONTEXT D-33 distinguishes "Sin datos" (slate) from "0,0 %" (slate, flat) — but the user cannot tell which they're looking at because both render the same neutral grey.

**Fix:** Either (a) propagate a richer return type from `pctDelta` that distinguishes `{ kind: 'no-prior' }` from `{ kind: 'flat' }` from `{ kind: 'value', pct: number }`, OR (b) compute "prior had any matching rows" via a separate `COUNT(*) FILTER (WHERE kind != 'transfer' AND ...)` and gate the empty-state on that count rather than `txn_count`. Option (a) is cleaner:
```typescript
function pctDelta(current: bigint, prior: bigint): number | null {
  if (prior === 0n) return current === 0n ? 0.0 : null;
  return Math.round(((Number(current) - Number(prior)) / Math.abs(Number(prior))) * 1000) / 10;
}
// Replace `priorIsEmpty` gate with a per-component check using the actual income/expense sum,
// not the row count, so transfer-only prior months are still flagged as "no comparable data".
```
Add a unit test that asserts the prior-month-transfer-only case renders "Sin datos del mes anterior" rather than "0,0 %".

---

### CR-03: `getTrendSeries` rolling window uses UTC, not Europe/Madrid — drifts across DST and at the day boundary

**File:** `lib/aggregates.ts:320-379`
**Issue:** The window is computed as
```typescript
const today = new Date();
const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - window + 1, 1));
const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
```
On a UTC server (Vercel), at any time between 22:00 UTC and 24:00 UTC during CEST (UTC+2 in summer), the user's local Madrid date is the next day — and once that next day rolls into a new month in Madrid, the trend window is off by one month: the rightmost bar is the *prior* month from the user's perspective. The same applies to `to_char(${transactions.bookingDate}, 'YYYY-MM')` — `booking_date` is a `DATE` type (no TZ), but transactions inserted via the form use `new Date('YYYY-MM-DD')` (UTC midnight) for the user's *local* date, so the date column is the user's local-day string. The `to_char` in SQL is therefore producing user-local YYYY-MM, but the JS-side window calculation is UTC. They disagree at the boundary, producing either a missing month or a duplicated empty month at the window edges.

The codebase already has the right primitive (`monthBoundaryMadrid` in `lib/format.ts`) and the dashboard page uses `currentMadridMonth()`. `getTrendSeries` did not get the same treatment.

**Fix:**
```typescript
import { currentMadridMonth } from "@/lib/madrid-time"; // or inline equivalent

async function getTrendSeriesImpl(input: TrendInput): Promise<TrendSeriesRow[]> {
  const window = Math.max(1, Math.min(MAX_TREND_MONTHS, input.windowMonths));
  // Use Madrid month as anchor — matches D-32/D-35 dashboard semantics.
  const { year: nowY, month: nowM } = currentMadridMonth(); // 1-indexed
  const startMonth = new Date(Date.UTC(nowY, nowM - 1 - (window - 1), 1));
  const endExclusive = new Date(Date.UTC(nowY, nowM, 1));
  // ... rest unchanged
}
```
Add a unit test that fixes the system clock to `2026-04-30T22:30:00Z` (April 30 22:30 UTC = May 1 00:30 Madrid CEST) and asserts the rightmost trend month is `2026-05`, not `2026-04`. Also add a Playwright test that visits `/` on the day boundary and asserts the trend X-axis labels.

---

## Warnings

### WR-01: `withCache` fallback is a brittle string-match against a Next.js internal error message

**File:** `lib/aggregates.ts:53-70`
**Issue:** The wrapper catches *any* error matching `"incrementalCache missing"` and falls through to the raw impl. If Next.js changes that error string in a minor version (it has changed before — "incremental cache missing" / "Invariant: incrementalCache missing" / etc.), the cache silently bypasses in production where it should not, **or** real cache failures get silently swallowed in production and the dashboard starts hitting the DB on every request without any warning. There is no telemetry on which path was taken.
**Fix:** Detect the test environment explicitly instead of error-message sniffing:
```typescript
const IS_NEXT_RUNTIME =
  typeof globalThis !== "undefined" &&
  ("nextRequestContext" in globalThis ||
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge");

function withCache<TArgs extends readonly unknown[], TResult>(impl, keyParts, options) {
  if (!IS_NEXT_RUNTIME) {
    return impl; // Vitest / standalone — no cache, no surprises.
  }
  return unstable_cache(impl, keyParts, options);
}
```
Or, in the test setup, mock `next/cache` (as the action tests already do at `app/(authenticated)/actions/transactions.test.ts:46-49`).

---

### WR-02: `restoreTransaction` lacks a `softDeletedAt IS NOT NULL` guard, accepting "restore" of non-deleted rows as success

**File:** `app/(authenticated)/actions/transactions.ts:412-442`
**Issue:** The `WHERE` clause is `eq(transactions.id, id)` only. Calling `restoreTransaction(id)` against a row that was never deleted bumps `updatedAt` and returns `{ ok: true }` — the action is documented as "idempotent restore" (line 421-422), which is defensible, but it also bumps `updated_at` for no reason. More importantly, the action accepts the call without informing the caller the row was never actually deleted, defeating audit traceability. If the UI ever drives a "Restore" link on rows that aren't deleted, the user sees "Transacción restaurada" toast for a no-op.
**Fix:** Add an explicit guard — if the row is already non-deleted, return `{ ok: true }` (or a new `kind:"already_active"`) without an UPDATE:
```typescript
const updated = await db
  .update(transactions)
  .set({ softDeletedAt: null, updatedAt: new Date() })
  .where(and(eq(transactions.id, id), isNotNull(transactions.softDeletedAt)))
  .returning({ id: transactions.id });
if (updated.length === 0) {
  // Either the row doesn't exist OR it was never deleted; check separately if you
  // want to disambiguate. Otherwise return not_found.
  const exists = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, id)).limit(1);
  return { ok: false, kind: exists.length === 0 ? "not_found" : "not_found" };
}
```

---

### WR-03: `softDeleteTransaction` returns `kind:"not_found"` for malformed UUID — masks a real "validation" failure

**File:** `app/(authenticated)/actions/transactions.ts:386, 418`
**Issue:** `if (!idCheck.success) return { ok: false, kind: "not_found" }` — both `softDeleteTransaction` and `restoreTransaction` collapse "malformed UUID" and "no such row" into the same response. This makes debugging hard (a frontend bug passing the wrong identifier looks like a stale row) and contradicts the discriminated-union contract (`SoftDeleteResult` only has `not_found` / `server_error` — there is no `validation` variant, so the pattern propagates the issue).
**Fix:** Add `kind:"validation"` to `SoftDeleteResult` and `RestoreResult`:
```typescript
export type SoftDeleteResult =
  | { ok: true }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "server_error" };
```
Return `validation` on `idCheck.success === false`. Update `RowActions.tsx` to surface a distinct toast for validation errors.

---

### WR-04: `Filters.tsx` search input uses `defaultValue` only — URL→input sync breaks on navigation/back-button

**File:** `app/(authenticated)/transacciones/_components/Filters.tsx:108, 118, 127, 136, 145`
**Issue:** Every filter input is uncontrolled (`defaultValue={q ?? ""}`). When the user clicks the "Limpiar filtros" button, `clearAll()` writes `null` to URL state via nuqs — but the inputs DO NOT clear because `defaultValue` is only consulted on first mount. Same for back/forward navigation: URL changes, input does not. The user sees a non-empty input field with the URL claiming the filter is cleared. Same bug for `desde`/`hasta`/`min`/`max`.
**Fix:** Switch to controlled inputs with `value={q ?? ""}`:
```typescript
<Input
  id="filter-q"
  placeholder="Descripción..."
  value={q ?? ""}
  maxLength={200}
  onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(setQ, e.target.value)}
/>
```
Apply to all five filter inputs. Add an E2E test that asserts inputs clear when "Limpiar filtros" is clicked.

---

### WR-05: `transacciones.spec.ts` "Reintentar" assertion is `expect(true).toBe(true)` — test is meaningless

**File:** `tests/e2e/transactions.spec.ts:419-427`
**Issue:**
```typescript
expect(boundaryVisible || retryVisible || true).toBe(true);
```
The `|| true` makes this assertion a no-op — the test always passes regardless of whether the error boundary actually rendered. The comment acknowledges the limitation ("KNOWN LIMITATION") but ships an always-green test, which is worse than no test (it gives false confidence that LIST-05 is covered).
**Fix:** Either remove this test entirely and document in SUMMARY.md that LIST-05 boundary copy is unit-tested only, or use a real error trigger. A clean approach: add a hidden `?_throw_test=1` query param that the page server-side reads and `throw new Error('test')` when set — only enabled when `process.env.NODE_ENV !== 'production'`. Then assert the boundary copy directly:
```typescript
await page.goto("/transacciones?_throw_test=1");
await expect(page.getByText("No se han podido cargar las transacciones. Reintenta.")).toBeVisible();
await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
```

---

### WR-06: `addTransactionSchema.account_id` accepts arbitrary UUIDs without ownership check (T-02-07 mitigation overstated)

**File:** `app/(authenticated)/actions/transactions.ts:80-111, 213-244`
**Issue:** `addTransaction` accepts an `account_id` from the form data and uses it directly as the FK target. There is no check that the account belongs to the current owner — `defaultAccountId()` is only consulted when the form omits the field. Phase 2 has a single owner so the practical risk is nil; however, the threat-model claim T-02-07 ("every action verifies session via auth.api.getSession") does not address authorization-after-authentication. When Phase 4 adds PSD2-connected accounts, the action will silently allow a request to write transactions to *any* `accounts.id` value the attacker can guess — there is no `accounts.owner_user_id` column to bind against, and the comment "Single-owner scope (D-04 / D-43)" acknowledges this is dormant rather than fixed.
**Fix:** For Phase 2, simply remove `account_id` from `addTransactionSchema` so the form cannot supply it. Resolve via `defaultAccountId()` exclusively:
```typescript
const addTransactionSchema = z.object({
  amount: z.string().min(1).max(20).transform(...),
  booking_date: z.coerce.date().refine(...),
  description: z.string().min(1).max(200),
  category_id: z.string().uuid(),
  // account_id removed — Phase 4 adds it back with an ownership-bound check.
});
```
For Phase 4, add a `accounts.owner_user_id` column and a helper `accountBelongsToUser(accountId, userId)` called before any insert.

---

### WR-07: `dateRange()` is called inside Zod `.refine` — recomputes on every parse and uses `Date.now()` non-deterministically

**File:** `app/(authenticated)/actions/transactions.ts:69-104`
**Issue:** `dateRange()` constructs a fresh `Date` each time `addTransactionSchema.safeParse(...)` runs. The values are stable enough at the granularity of a request, but they make the schema non-pure (testing the schema in isolation requires mocking `Date.now()`), and the .999ms end-of-day hack (`latest.setHours(23, 59, 59, 999)`) leaks UTC semantics into a comparison against a `z.coerce.date()`-parsed value that is UTC midnight for the form-submitted YYYY-MM-DD. On Apr 30 23:30 Madrid (CEST), `latest` is May 1 23:59:59.999 UTC → effectively allowing booking dates up to May 2 Madrid. The "+1 day" allowance becomes "+2 days" depending on submission time.
**Fix:** Pass the clamp range in as an arg or compute the bounds server-side once per request:
```typescript
function buildAddSchema(now: Date) {
  const earliest = new Date(now); earliest.setUTCFullYear(earliest.getUTCFullYear() - 5); earliest.setUTCHours(0,0,0,0);
  const latest = new Date(now); latest.setUTCDate(latest.getUTCDate() + 1); latest.setUTCHours(23,59,59,999);
  return z.object({ /* ... */ booking_date: z.coerce.date().refine(d => d >= earliest && d <= latest, { message: "Fecha fuera de rango." }), /* ... */ });
}
// In action: const schema = buildAddSchema(new Date()); const parsed = schema.safeParse(...);
```
Add a test that fixes the clock and asserts the boundary inclusively.

---

### WR-08: `MonthPicker` `buildMonthOptions` uses local-time `today.getFullYear()` / `getMonth()` — wrong on UTC server / Madrid client mismatch

**File:** `app/(authenticated)/_components/MonthPicker.tsx:30-43`
**Issue:** `MonthPicker` is a Client Component, so `new Date().getFullYear()` is the *user's browser local time*. For a Madrid user this is correct in steady state. But during SSR (the dashboard RSC renders the picker via `<MonthPicker defaultValue={mesValue} />`), Next 16 hydration runs the same code — and the SSR rendering happens on the server (UTC). At the day boundary the SSR HTML has month options ending at `2026-04`, while client hydration produces `2026-05`. This causes a **React hydration mismatch warning** in production and selects the wrong default month.
**Fix:** Receive `currentMonth` from the parent RSC (which already computes it via `currentMadridMonth()`) and use that as the anchor for `buildMonthOptions`:
```typescript
export interface MonthPickerProps {
  defaultValue: string;
  currentMonth: { year: number; month: number }; // pass from page.tsx
}

function buildMonthOptions(anchor: { year: number; month: number }): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < MONTHS_TO_SHOW; i++) {
    const year = anchor.month - i > 0 ? anchor.year : anchor.year - Math.ceil((i - anchor.month + 1) / 12);
    const month = ((anchor.month - i - 1 + 12 * 100) % 12) + 1;
    out.push({ value: `${year}-${String(month).padStart(2, "0")}`, label: formatMonthEs(year, month) });
  }
  return out;
}
```

---

### WR-09: `QuickAddSheet.todayISO()` uses local components for date prefill — same UTC/Madrid mismatch as WR-08

**File:** `app/(authenticated)/transacciones/_components/QuickAddSheet.tsx:89-95`
**Issue:** Identical to WR-08. The Client Component `todayISO()` uses `getFullYear/getMonth/getDate` (browser-local), but the server-rendered HTML for the `<Input type="date" defaultValue={initialDate}>` is computed on the UTC server during SSR. At the Madrid day-boundary, hydration mismatch logs in dev and the prefilled date is the wrong day.
**Fix:** Either render this entirely client-side (move the `defaultValue` computation into `useEffect` after mount), or compute "today in Madrid" via `new Intl.DateTimeFormat('es-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())` which works identically on both runtimes (assuming both have the Europe/Madrid timezone data, which Vercel does).

---

## Info

### IN-01: `parseEurInput` ambiguous-thousands rule rejects `1.234.567` (valid Spanish thousands chain)

**File:** `lib/format.ts:131-139`
**Issue:** The current rule rejects any string with multiple dots and no comma, even when the dots form a valid thousands chain (`1.234.567` should be `1234567` integer euros). For Phase 2 the form only allows ≤ 20 chars and the user is unlikely to enter that, but for parsing pasted clipboard text from a bank statement (Phase 4 scenario) this will be brittle.
**Fix:** Validate the thousands-chain shape (`^\d{1,3}(\.\d{3})+$`) and accept it as integer euros when it matches:
```typescript
} else if (dotCount > 1) {
  if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    throw new Error(`parseEurInput: ambiguous multiple dots in "${value}"`);
  }
}
```
Add tests for `1.234.567` (= 123456700n) and `1.2.3.4` (rejection).

---

### IN-02: `currency` column in `accounts` is `text` rather than `char(3)` / CHECK — D-18 says "char(3)"

**File:** `drizzle/schema.ts:144-152` and `drizzle/migrations/0001_phase2_transactions.sql:1-8`
**Issue:** Schema author flagged this as a TODO ("Phase 4 may tighten to varchar(3) / CHECK (length=3); D-18 specifies char(3)"). Right now nothing prevents inserting `currency = 'AUSTRALIAN_DOLLAR'`. Defensive constraint is cheap and Phase 2-appropriate.
**Fix:** In a follow-up migration, `ALTER TABLE accounts ADD CONSTRAINT accounts_currency_iso_check CHECK (length(currency) = 3 AND currency = upper(currency))`. The Drizzle column can stay `text` for now.

---

### IN-03: `MoMDelta` uses `delta === 0` strict-equality but `pctDelta` returns rounded values — `0.0 !== -0.0` ambiguity

**File:** `app/(authenticated)/_components/MoMDelta.tsx:37` and `lib/aggregates.ts:154-162`
**Issue:** `pctDelta` returns `Math.round(((c - p) / Math.abs(p)) * 1000) / 10`, which for `c < p` produces negative numbers. JavaScript has both `+0` and `-0` (`Object.is(0, -0) === false`). `delta === 0` is `true` for both (per `===` rules), so this is technically safe — but the intent is unclear. Adding `Math.abs(delta) < 0.05` (matching the 1-decimal precision) is more robust and reads more obviously.
**Fix:**
```typescript
if (delta === null) { ... }
if (Math.abs(delta) < 0.05) { return <span ...>0,0 %</span>; }
```

---

### IN-04: `dedup_key` minute-bucket uses `Math.floor(anchorMs / 60_000)` — accepts non-integer (NaN, Infinity) anchorMs without validation

**File:** `lib/dedup.ts:65-76`
**Issue:** If `anchorMs` is `NaN` (e.g., callers passed an invalid date), `Math.floor(NaN / 60_000) === NaN` and `NaN.toString() === "NaN"`. The dedup key would be `sha256(...|NaN)`, which is deterministic but defeats the bucket's intent. Pure helpers should validate inputs explicitly.
**Fix:**
```typescript
if (!Number.isFinite(input.anchorMs)) {
  throw new Error("computeManualDedupKey: anchorMs must be a finite number");
}
```

---

### IN-05: `fetchEditTarget` in transacciones/page.tsx uses local-time date components — UTC server / Madrid client divergence on display

**File:** `app/(authenticated)/transacciones/page.tsx:131-144`
**Issue:** `date.getFullYear()`, `getMonth()`, `getDate()` use the server's local timezone (UTC on Vercel). For a row with `booking_date = '2026-05-01'` returned by Drizzle's date column, the resulting Date object is `2026-05-01T00:00:00Z`; on a UTC server, getDate returns 1, getMonth returns 4 — correct. But on a non-UTC dev environment (e.g., a local laptop in Madrid +02), getDate could return 30, getMonth 3 (i.e., April 30). The Quick-Add Sheet then prefills `2026-04-30`. Same root cause as WR-08/WR-09.
**Fix:** Use `date.getUTCFullYear/getUTCMonth/getUTCDate` since the value was stored as date-without-TZ:
```typescript
const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
const dd = date.getUTCDate().toString().padStart(2, "0");
```

---

### IN-06: `seed-categories.ts` uses `require.main === module` — works in CJS-default package, but blocks future migration to `"type": "module"`

**File:** `scripts/seed-categories.ts:84`
**Issue:** `require.main === module` is the CJS pattern. The `package.json` has no `"type": "module"`, so it works today via tsx's CJS mode. If the project ever migrates to ESM (a likely Next 16+ direction), this guard becomes a `ReferenceError` at module load.
**Fix:** Use the platform-agnostic check:
```typescript
import { fileURLToPath } from "node:url";
const isMainModule =
  typeof require !== "undefined"
    ? require.main === module
    : process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) { ... }
```
Or simply expose `seedCategoriesAndAccounts` as the only export and let the npm script entry-point be `tsx -e "import('./scripts/seed-categories.ts').then(m => m.seedCategoriesAndAccounts())"`.

---

_Reviewed: 2026-05-02T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
