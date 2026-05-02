---
phase: 02-manual-tracker-mvp
verified: 2026-05-02T13:20:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run full Playwright E2E suite against a running Next.js dev server"
    expected: "All 20 Phase 2 e2e tests pass (11 transactions + 9 dashboard) plus all 18 Phase 1 e2e tests still pass — total 38 passing, 0 failing"
    why_human: "Plan 09 SUMMARY explicitly states `npm run test:e2e` was NOT executed in the worktree (only tsc + eslint + playwright --list). The suite syntax-validates and the static evidence is strong, but actually running the browser-driven tests against a live Next dev server is the contracted Wave-5 verification gate (Plan 09 Task 4). Cannot be verified programmatically without spinning up the dev server."
  - test: "Manually exercise the dashboard on a real mobile browser at ≤375px width"
    expected: "MonthPicker dropdown is reachable; KPI cards stack to one column; trend chart adapts to viewport; mobile bottom-tab nav is visible and AddFab tappable"
    why_human: "UX-02 mobile-friendliness is asserted in code (sm:grid-cols-3, sm:hidden, side='bottom' Sheet, MobileBottomNav) but actual responsive behavior at the device level is visual — not testable by grep or static analysis. UX-01 mobile certification is Phase 7, but Phase 2 already targets mobile."
  - test: "Visually verify Recharts category bar chart drilldown actually navigates correctly"
    expected: "Clicking a bar in the dashboard's 'Gastos por categoría' chart navigates to /transacciones?cat={uuid}&mes=YYYY-MM and the list filters to that category"
    why_human: "Recharts SVG click-handler payloads vary by version; the Plan 09 e2e test exists but its bar-selector is fragile (.recharts-bar rect) and the actual click→nav round-trip is best confirmed in a real browser session."
  - test: "Confirm sonner toast 'Deshacer' undo flow operates within the 5-second window in a real browser"
    expected: "After clicking 'Borrar' on a row, the toast 'Transacción borrada · Deshacer' appears for ~5 seconds; clicking 'Deshacer' restores the row and shows 'Transacción restaurada' toast"
    why_human: "Toast timing/animation is real-time UI behavior. Code path is verified (RowActions.tsx duration: 5000 + softDelete/restore action calls) but visual confirmation is human-only."
  - test: "Verify Spanish copy renders correctly across all empty/loading/error states by exercising each path manually"
    expected: "Pristine empty list, filter-empty list, <3-month trend chart, MoM null prior, dedup-collision form error, route-level error.tsx — each renders the verbatim Spanish copy from CONTEXT.md"
    why_human: "All copy is verified as string literals in the source; e2e tests assert on them. But final user-facing rendering (font, accent marks, line breaks) is best confirmed visually in a real browser before sign-off."
---

# Phase 2: Manual Tracker MVP Verification Report

**Phase Goal:** Owner can run their entire monthly financial tracking workflow manually — add transactions, search/filter, see the monthly cash-flow dashboard with MoM delta and 6-12 month trends — with zero external service dependencies. This is the "if everything else fails" backstop value.

**Verified:** 2026-05-02T13:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner can add a manual income or expense transaction in ≤4 visible fields on a mobile browser, edit it, soft-delete it, and visually distinguish it from synced transactions | VERIFIED | `QuickAddSheet.tsx` renders exactly 4 named fields (`amount`, `booking_date`, `description`, `category_id`); Importe is `inputMode="decimal" autoFocus`; mobile uses `side="bottom"` (matchMedia(min-width 640px)); edit reopens via `?editar={id}` with prefilled values; soft-delete via `softDeleteTransaction` Server Action with sonner Deshacer 5s undo (RowActions.tsx); `SourceBadge` shows "Manual" badge for source='manual' rows. Server Action integration tests (10/10) confirm full lifecycle: add → edit → soft-delete → restore. |
| 2 | Owner can browse the transaction list with search-by-description, filter by amount range / date range / multi-select category, paginated 50-per-page in stable booking_date desc order | VERIFIED | `Filters.tsx` binds q/min/max/desde/hasta/cat/pag to URL via nuqs; `cat` uses `parseAsArrayOf(parseAsString)` for true multi-select with Popover+Checkbox grouped by kind. `lib/aggregates.ts getTransactionsList` paginates `LIST_PAGE_SIZE=50`, orders by `desc(bookingDate), desc(id)` for stability, uses `ilike()` parameterized search and `inArray()` for cat filter. Aggregates integration test #8 verifies "51 rows → page 1 returns 50 + total:51, page 2 returns 1"; #11 verifies stable order; #9 verifies ILIKE case-insensitive; #10 verifies min/max filter. All 11 aggregates tests pass. |
| 3 | Owner sees monthly dashboard with total income, total expenses, net cash flow, expense-by-category bar chart, arrow+percentage MoM delta — all rendered with `Intl.NumberFormat('es-ES', { currency: 'EUR' })` and `DD/MM/YYYY` dates | VERIFIED | `app/(authenticated)/page.tsx` is the dashboard (replacing Phase 1 placeholder); fetches `getMonthlyKpisWithDelta`, `getCategoryBreakdown`, `getTrendSeries` in `Promise.all`. `KpiCards.tsx` renders Ingresos/Gastos/Neto via `formatEur()` (which routes to `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })`). `MoMDelta.tsx` renders `↑`/`↓` + `pctFormatter.format(...) %` (es-ES, 1 decimal); direction-aware colors (positive-good vs negative-good). `CategoryBarChart.tsx` is Recharts horizontal `BarChart` with top-8+Otros rollup; bar onClick navigates to `/transacciones?cat={id}&mes={month}`. Internal transfers excluded by `lib/aggregates.ts` (`sql\`${categories.kind} != 'transfer'\`` in 4 places). Format tests (40 in lib/format.test.ts) assert formatEur output `1.234,56 €` and formatDateShortEs DD/MM/YYYY. |
| 4 | Owner sees 6-12 month trend chart for income, expenses, and net — read entirely from pre-computed data with no synchronous external calls | VERIFIED | `MonthlyTrendChart.tsx` is Recharts `ComposedChart` with stacked `Bar` (income emerald-500 #10b981, expense_negative rose-500 #f43f5e) and `Line` (net blue-500 #3b82f6). `lib/aggregates.ts getTrendSeries` builds `windowMonths`-row series including zero-bar months (D-35 — never skips empty months); aggregates test #7 verifies "seed 2 of 6 months → returns 6 rows, 4 with zero values". Empty-state copy "Añade transacciones durante al menos 3 meses para ver tu tendencia." renders when `monthsWithData < 3`. DASH-07 satisfied: dashboard reads only via `lib/aggregates.ts` (cached + DB) — no fetch to anthropic.com or PSD2 aggregator anywhere in the request path (verified by grep across `app/(authenticated)/`). |
| 5 | Empty, loading, and error states render explicit Spanish copy on every list and chart | VERIFIED | Verbatim Spanish copy in source: `TransactionList.tsx` ("Aún no has añadido ninguna transacción." / "No hay transacciones que coincidan con los filtros."); `error.tsx` ("No se han podido cargar las transacciones. Reintenta." + "Reintentar"); `MoMDelta.tsx` ("Sin datos del mes anterior" / "0,0 %"); `MonthlyTrendChart.tsx` ("Añade transacciones durante al menos 3 meses para ver tu tendencia."); `QuickAddSheet.tsx` ("Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?" / "Transacción añadida" / "Cambios guardados" / "Revisa los campos marcados."); `RowActions.tsx` ("Transacción borrada" / "Deshacer" / "Transacción restaurada"). Loading state in page.tsx via Suspense + Skeleton (5 rows). Plan 09 e2e suite asserts these strings verbatim. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `drizzle/schema.ts` | accounts/categories/transactions tables with full column list, indexes, CHECK constraints | VERIFIED | All 3 pgTable definitions present; 3 partial indexes (booking_date_partial, account_booking_partial, category_booking_partial); unique index on (account_id, dedup_key); CHECK on amount_cents > 0 and amount_eur_cents > 0; FK to accounts (restrict) and categories (restrict); 6 type exports (Account/NewAccount/Category/NewCategory/Transaction/NewTransaction). |
| `drizzle/migrations/0001_phase2_transactions.sql` | DDL for accounts/categories/transactions + indexes + CHECK + self-FK on transfer_pair_id | VERIFIED | 62-line migration includes all 3 CREATE TABLE, 4 indexes, 2 CHECK constraints, 2 FK constraints (accounts, categories), and the hand-patched self-FK ALTER for transfer_pair_id (ON DELETE SET NULL). |
| `scripts/seed-categories.ts` | Idempotent seed for 14 categories + 1 'Efectivo' account | VERIFIED | Seeds 10 expense + 3 income + 1 transfer; idempotency guards via `count()` before insert. Live verification: `npx tsx --env-file=.env.local scripts/migrate.ts` confirmed "14 categories already exist; skipping seed. 1 accounts already exist; skipping seed." |
| `lib/dedup.ts` | computeManualDedupKey + normalizeDescription helpers | VERIFIED | Pure functions; sha256 of `accountId\|date\|amountCents\|normalizedDescription\|minuteBucket`; 13 unit tests pass (incl. minute-truncation invariant). |
| `lib/format.ts formatMonthEs` | New helper returning capitalized 'Mayo 2026' | VERIFIED | Implementation uses Intl.DateTimeFormat es-ES + Europe/Madrid + day=15 anchor (DST-safe); 6 unit tests pass; replaces the " de " connector. |
| `lib/aggregates.ts` | 5 cached functions: getMonthlyKpis(WithDelta), getCategoryBreakdown, getTrendSeries, getTransactionsList | VERIFIED | All 5 exported; each wrapped in `withCache` (calls unstable_cache with tags ['transactions','dashboard']); withCache fallback to raw impl if "incrementalCache missing" (test runtime). All read paths filter `isNull(softDeletedAt)` (5+ occurrences). All KPI/breakdown/trend paths exclude transfer kind (4+ occurrences). 11/11 integration tests pass against live Neon. |
| `app/(authenticated)/actions/transactions.ts` | 4 Server Actions: addTransaction, editTransaction, softDeleteTransaction, restoreTransaction | VERIFIED | "use server" directive; 4 exported async functions; all check session via `auth.api.getSession`; revalidateTag('transactions') AND revalidateTag('dashboard') called on every successful write (8 calls visible — 2 per action × 4); duplicate (23505) → kind:"duplicate"; FK violation (23503) → kind:"validation"; logger.info passes description_raw under that exact key for redaction. 10/10 integration tests pass; logs show "[REDACTED]" for description_raw. |
| `app/(authenticated)/transacciones/_components/QuickAddSheet.tsx` | 4-field form bound to URL state | VERIFIED | "use client"; useQueryState for ?nuevo=1/?editar={id}; 4 fields with names matching server action schema; Importe inputMode="decimal" autoFocus; date input default=today; description maxLength=200; CategorySelect grouped by kind (Gastos/Ingresos/Movimientos); sonner toasts; matchMedia(min-width 640px) for Sheet side. |
| `app/(authenticated)/transacciones/_components/Filters.tsx` | URL-bound filter bar with multi-select category Popover | VERIFIED | useQueryState bindings for q/min/max/desde/hasta/cat/pag; cat uses parseAsArrayOf(parseAsString); Popover + Checkbox per category, grouped by kind (Gastos/Ingresos/Movimientos); "Limpiar filtros" reset; pag reset to null on every filter change. |
| `app/(authenticated)/transacciones/page.tsx` | RSC page reading searchParams + rendering list | VERIFIED | Server Component (no "use client"); awaits searchParams; defensive parse (T-02-20..23); Promise.all fetches categories + getTransactionsList + defaultCategoryId + editTarget; mounts QuickAddSheet, Filters, TransactionList, Pagination. |
| `app/(authenticated)/transacciones/error.tsx` | Route-specific Spanish error boundary | VERIFIED | "use client"; renders verbatim "No se han podido cargar las transacciones. Reintenta." + Reintentar button; logs only error.digest (T-02-26). |
| `app/(authenticated)/page.tsx` (dashboard) | RSC dashboard with KPIs + MoM + category chart + trend chart | VERIFIED | Server Component; replaces Phase 1 placeholder; Promise.all for getMonthlyKpisWithDelta, getCategoryBreakdown, getTrendSeries; renders KpiCards + CategoryBarChart + MonthlyTrendChart + MonthPicker. mes=YYYY-MM regex-validated, year clamped to [thisYear-25, thisYear+1]. monthsWithData precomputed server-side. |
| `app/(authenticated)/_components/MoMDelta.tsx` | Direction-aware MoM badge | VERIFIED | Client component; pctFormatter('es-ES', 1 decimal); arrow up/down + abs%; positive-good (Ingresos/Neto) green-up, red-down; negative-good (Gastos) red-up, green-down; null → "Sin datos del mes anterior"; 0 → "0,0 %". |
| `app/(authenticated)/_components/CategoryBarChart.tsx` | Horizontal Recharts bars + Otros rollup + drilldown | VERIFIED | "use client"; Recharts BarChart layout="vertical"; top 8 + Otros rollup in TS (filter to expense kind only); bar onClick → router.push(`/transacciones?cat={id}&mes={month}`); Cell color rose-500 (#f43f5e) for clickable, slate-400 (#94a3b8) for Otros. |
| `app/(authenticated)/_components/MonthlyTrendChart.tsx` | ComposedChart with stacked bars + net line + <3-month empty state | VERIFIED | "use client"; ComposedChart with Bar(income, emerald-500 #10b981) + Bar(expense_negative, rose-500 #f43f5e) stackId="cashflow" + Line(net, blue-500 #3b82f6); empty state when monthsWithData < 3 with verbatim Spanish copy. |
| `app/(authenticated)/_components/MonthPicker.tsx` | nuqs-bound month dropdown | VERIFIED | useQueryState("mes"); buildMonthOptions returns 24 last months via formatMonthEs; aria-label="Mes". |
| `app/(authenticated)/_components/KpiCards.tsx` | 3 KPI cards with formatEur + MoMDelta | VERIFIED | Server component; Card per Ingresos/Gastos/Neto; formatEur(); MoMDelta with direction-aware kind. |
| `app/(authenticated)/layout.tsx` | Authenticated shell with TopNav + AddFab + MobileBottomNav | VERIFIED | Session check preserved (redirect("/login")); UserMenu preserved; TopNav (desktop only via hidden sm:flex); AddFab variant="header" (desktop); MobileBottomNav (sm:hidden); pb-16 sm:pb-0 on main for mobile clearance. |
| `app/(authenticated)/_components/AddFab.tsx` | Persistent + Añadir trigger preserving URL state | VERIFIED | useSearchParams + URLSearchParams to preserve q/pag/cat/etc when adding nuevo=1 on /transacciones; redirects from other pages to /transacciones?nuevo=1; aria-label="Añadir transacción"; mobile + header variants. |
| `components/ui/{sheet,select,badge,table,tabs,skeleton,popover,checkbox}.tsx` | shadcn primitives | VERIFIED | All 8 files present in components/ui/. |
| `tests/e2e/transactions.spec.ts` + `dashboard.spec.ts` + `fixtures.ts` | Playwright suite + helpers | VERIFIED (file/syntax) | 11 + 9 = 20 tests authored; verbatim Spanish copy assertions; loginAsOwner + resetTransactions + insertTestTransaction helpers added; `npx playwright test --list` shows 38 total tests parsing correctly. **Execution status: not run end-to-end** — see human_verification. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `addTransaction` Server Action | `lib/dedup.ts computeManualDedupKey` | direct call before db.insert | WIRED | Imported and called with accountId/bookingDate/amountCents/description/anchorMs at action.ts:238-244. |
| `addTransaction` (and others) | `next/cache updateTag` (Next 16 split, replaces revalidateTag) | post-insert/update | WIRED | Local `revalidateTag(tag)` shim wraps `updateTag(tag)` (Next 16 Server Action API). 8 call sites (2 per action × 4 actions) for tags 'transactions' and 'dashboard'. **Note:** uses `updateTag` instead of legacy `revalidateTag` per Next 16 API split — semantically equivalent for tag invalidation, with read-your-own-writes guarantees. |
| Server Actions | `lib/auth.ts auth.api.getSession` | session check | WIRED | All 4 actions call `ensureSession()` which calls `auth.api.getSession({ headers })` — no env-gated bypass. Tests inject session via `vi.mock("@/lib/auth")`. |
| `QuickAddSheet` | `addTransaction` / `editTransaction` Server Actions | form action callback | WIRED | onSubmit awaits result of action, switches on result.kind, sonner toast on ok, fieldErrors on validation. |
| `QuickAddSheet` | nuqs `useQueryState` | open/close binding | WIRED | useQueryState("nuevo") + useQueryState("editar"); isOpen derived; close() clears the active param. |
| `dashboard page.tsx` | `lib/aggregates.ts (3 functions)` | Promise.all RSC fetch | WIRED | getMonthlyKpisWithDelta + getCategoryBreakdown + getTrendSeries all called in parallel. |
| `transacciones page.tsx` | `lib/aggregates.ts getTransactionsList` | RSC await | WIRED | Called with parseInputs(sp) result. |
| `CategoryBarChart` bar click | `/transacciones?cat={id}&mes={month}` | router.push | WIRED | onClick reads payload, router.push to drilldown URL with both params encoded. |
| `RowActions Borrar/Deshacer` | softDeleteTransaction / restoreTransaction | Server Action call from sonner toast | WIRED | onDelete awaits softDelete, on ok renders toast with action.onClick that awaits restoreTransaction. |
| `Filters` | nuqs `parseAsArrayOf(parseAsString)` for cat | URL state binding | WIRED | Multi-value parser confirmed in source; serializes as comma-separated UUIDs per LIST-03 / D-28. |
| `error.tsx` | route boundary | reset() call | WIRED | useEffect logs digest; reset() button calls Next.js reset. |
| `AddFab` | URL state preservation | useSearchParams + URLSearchParams | WIRED | Preserves existing params when on /transacciones; navigates fresh from other pages. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `KpiCards` | `data.current.income_cents` etc | `getMonthlyKpisWithDelta` (lib/aggregates.ts) → DB JOIN on transactions × categories with SUM CASE | Yes — Drizzle SQL query against live transactions table | FLOWING |
| `CategoryBarChart` | `data` (CategoryBreakdownRow[]) | `getCategoryBreakdown` → DB groupBy categoryId/name/kind | Yes — real DB query | FLOWING |
| `MonthlyTrendChart` | `data` (TrendSeriesRow[]) | `getTrendSeries` → DB query with to_char(booking_date) groupBy + JS zero-fill | Yes — real DB query, gaps filled to N rows | FLOWING |
| `TransactionList` | `page.rows` | `getTransactionsList` → DB select with conditions, order, limit, offset | Yes — real DB query with parameterized filters | FLOWING |
| `QuickAddSheet` (edit mode) | `editTarget` | RSC `fetchEditTarget(id)` → db.select().from(transactions).where(eq(id)) | Yes — real DB query | FLOWING |
| `QuickAddSheet` (default category) | `defaultCategoryId` | RSC `defaultCategoryId()` → last-used or first-expense-by-sortOrder | Yes — real DB query with proper fallback | FLOWING |
| `Filters` | `categories` prop | RSC `db.select().from(categories).orderBy(sortOrder)` | Yes — 14 seeded rows in live DB | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript strict mode compiles | `npx tsc --noEmit` | exit 0, no output | PASS |
| ESLint passes with --max-warnings=0 | `npm run lint` | exit 0 | PASS |
| Format/Dedup unit tests pass | `npm test -- --run lib/dedup.test.ts lib/format.test.ts` | "88 passed (88)" | PASS |
| Aggregates integration tests against live Neon | `npm test -- --run lib/aggregates.test.ts` | "11 passed (11)" — verifies KPI math, transfer-exclusion, soft-delete-exclusion, MoM delta nulls, trend zero-fill, pagination, ILIKE, min/max, stable order | PASS |
| Server Action integration tests against live Neon | `npm test -- --run "app/(authenticated)/actions/transactions.test.ts"` | "10 passed (10)" — verifies add/edit/soft-delete/restore + dedup-collision + FK violation + soft-deleted-edit-rejection. Logs show description_raw → "[REDACTED]". | PASS |
| Next.js production build | `(env loaded) npx next build` | "Compiled successfully in 4.4s"; routes /, /transacciones, /login, /api/auth/[...all], /api/health all built | PASS |
| Live Neon DB row counts | `npx tsx --env-file=.env.local scripts/migrate.ts` | "14 categories already exist; skipping seed. 1 accounts already exist; skipping seed." | PASS |
| Playwright test suite syntax | `npx playwright test --list` | "Total: 38 tests in 8 files" — all 20 Phase 2 tests parsed correctly | PASS |
| Full Playwright E2E suite execution | `npm run test:e2e` against running dev server | NOT RUN — see human_verification | SKIP |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| MAN-01 | 02-01, 02-03, 02-05, 02-09 | Owner can add a manual transaction with amount, date, description, category, income/expense | SATISFIED | QuickAddSheet 4 fields + addTransaction Server Action + dedup; e2e test "MAN-01/02/05" + "MAN-01 dedup-collision" |
| MAN-02 | 02-05, 02-09 | Quick-add form has at most 4 visible fields, supports inputmode="decimal" | SATISFIED | QuickAddSheet has exactly 4 named fields; Importe is inputMode="decimal" autoFocus; e2e "MAN-01/02/05" |
| MAN-03 | 02-03, 02-05, 02-09 | Owner can edit any past transaction | SATISFIED | editTransaction Server Action + ?editar={id} URL pattern; integration tests #7-#8; e2e "MAN-03 — edit a transaction" |
| MAN-04 | 02-01, 02-03, 02-06, 02-09 | Soft-delete (restorable) | SATISFIED | softDeleteTransaction + restoreTransaction; soft_deleted_at timestamp column; RowActions Deshacer 5s toast; integration tests #9-#10; e2e "MAN-04 — soft-delete with Deshacer" |
| MAN-05 | 02-01, 02-06, 02-09 | Manual transactions visually distinguishable | SATISFIED | SourceBadge "Manual" for source='manual'; e2e "MAN-01/02/05 ... and see Manual badge" |
| LIST-01 | 02-04, 02-06, 02-09 | List displays date, description, category, amount, account | SATISFIED | TransactionList Table headers Fecha/Descripción/Categoría/Importe/Cuenta/Acciones |
| LIST-02 | 02-04, 02-06, 02-09 | Search transactions by description text (case-insensitive) | SATISFIED | Filters q input → URL → getTransactionsList ilike(); aggregates test #9 verifies "café" matches "Café del Trabajo" + "Café casa" but not "Cena restaurante"; e2e "LIST-02 — search filter narrows by description (ILIKE case-insensitive)" |
| LIST-03 | 02-02, 02-06, 02-09 | Filter by amount range, date range, multi-select category | SATISFIED | Filters bar with min/max/desde/hasta/cat (multi); cat uses parseAsArrayOf — true multi-select via Popover+Checkbox grouped by kind; aggregates test #10 verifies min/max; e2e "LIST-03 — multi-select category filter shows rows from BOTH selected categories" |
| LIST-04 | 02-04, 02-06, 02-09 | Paginated 50 per page, stable booking_date desc | SATISFIED | LIST_PAGE_SIZE=50; orderBy(desc(bookingDate), desc(id)); aggregates tests #8 (51 rows → 2 pages) and #11 (id desc tie-breaker); e2e "LIST-04 — pagination 51 rows produce 2 pages" |
| LIST-05 | 02-06, 02-09 | Empty/loading/error states explicit Spanish | SATISFIED | TransactionList empty branches + Suspense Skeleton fallback + route-level error.tsx with verbatim "No se han podido cargar las transacciones. Reintenta."; e2e tests "LIST-05 pristine empty", "LIST-05 filter-empty", "LIST-05 route-specific error.tsx" |
| DASH-01 | 02-04, 02-07, 02-09 | Monthly dashboard shows total income/expenses/net for selected month | SATISFIED | KpiCards renders Ingresos/Gastos/Neto via getMonthlyKpisWithDelta; aggregates test #1 (sums correct, transfers excluded); e2e "DASH-01/05 — KPIs render Ingresos/Gastos/Neto" |
| DASH-02 | 02-04, 02-07, 02-09 | Expense breakdown by top-level category as bar chart | SATISFIED | CategoryBarChart Recharts BarChart layout="vertical" + top-8+Otros rollup; bar onClick navigates to /transacciones?cat=&mes=; e2e "DASH-02 — category bar chart bar click navigates" |
| DASH-03 | 02-04, 02-07, 02-09 | MoM delta with arrow + percentage | SATISFIED | MoMDelta arrow ↑/↓ + 1-decimal Spanish %; aggregates tests #3-#5 verify MoM math + null-prior-empty + 0-flat; e2e "DASH-03 — MoM delta arrow shows ↑/↓ with 1-decimal Spanish percentage" + "DASH-03 — MoM empty-state copy" |
| DASH-04 | 02-04, 02-07, 02-09 | 6-12 month trend chart for income/expenses/net | SATISFIED | MonthlyTrendChart ComposedChart stacked-bars + net-line; getTrendSeries(windowMonths: 12); aggregates test #7 returns 6 rows incl. zero months; e2e "DASH-04 — trend chart renders SVG when ≥3 months" + "<3 months empty-state copy" |
| DASH-05 | 02-04, 02-07, 02-09 | Currency rendered with Intl.NumberFormat('es-ES', { currency: 'EUR' }) | SATISFIED | All currency goes through formatEur (lib/format.ts) which uses exactly that Intl formatter; e2e "UX-03 — currency format uses 'es-ES' decimal-comma (1.234,56 €)"; format.test.ts asserts formatEur output |
| DASH-06 | 02-01, 02-04, 02-07, 02-09 | Internal transfers excluded from income/expense aggregates | SATISFIED | "Traspaso interno" category seeded with kind='transfer'; lib/aggregates.ts excludes transfers in 4 places (`sql\`${categories.kind} != 'transfer'\``); aggregates test #1 ("transfer of 10000 cents excluded from income/expense/count"); e2e "DASH-06 — internal transfer rows excluded from KPIs" |
| DASH-07 | 02-04, 02-07, 02-09 | Dashboard reads only pre-computed data — no synchronous external calls | SATISFIED | dashboard page.tsx imports only from "@/lib/aggregates" + "@/lib/format" + components; no fetch to anthropic.com or PSD2 aggregator anywhere in app/(authenticated)/; all aggregates wrapped in unstable_cache with tags + revalidate windows |
| UX-02 | 02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09 | Empty states, loading skeletons, error toasts on every list and chart | SATISFIED | All empty/loading/error paths verified above (LIST-05 + DASH-04 + DASH-03 + MoMDelta + MonthlyTrendChart); Suspense + Skeleton in transacciones/page.tsx; sonner toasts on every Server Action result; e2e "UX-02 / D-43 — AddFab preserves existing URL state" |
| UX-03 | 02-02, 02-09 | Locale formatting (decimal commas, DD/MM/YYYY, € position) correct | SATISFIED | formatEur uses 'es-ES' currency formatter producing "1.234,56 €"; formatDateShortEs produces "DD/MM/YYYY" via 2-digit format parts; pctFormatter for MoM delta uses 1 decimal Spanish; format.test.ts has 40 tests asserting these; e2e "UX-03 — currency format uses 'es-ES' decimal-comma" |

**All 19 phase requirement IDs SATISFIED.** No orphaned requirements.

### Anti-Patterns Found

Anti-pattern scan was performed but is documented in detail in `02-REVIEW.md` (3 critical / 9 warning / 6 info — advisory, not blocking per orchestrator instruction). Key items relevant to goal achievement:

| File | Line | Pattern | Severity | Impact on Phase Goal |
|------|------|---------|----------|----------------------|
| `actions/transactions.ts:319-352` | editTransaction | account_id silently dropped + dedup_key not recomputed | Critical (advisory) | Edge-case data integrity issue; does NOT prevent the user from editing transactions; goal still achieved at user-visible level |
| `lib/aggregates.ts:154-162` | pctDelta(0,0) returns 0.0 | MoMDelta flat-vs-empty edge case | Critical (advisory) | Edge case where prior month has only transfer rows → "0,0 %" instead of "Sin datos del mes anterior". Misleading but not blocking — KPIs still correct |
| `lib/aggregates.ts:326-329` | getTrendSeries window uses UTC instead of Madrid month | Critical (advisory) | Trend window may shift by 1 month at the day boundary in Spain. Phase 7 UX-04 already covers DST-edge correction work; doesn't block Phase 2 functional value |
| Various | Warnings (9) | E.g. defaultValue-only search input, error.tsx e2e assertion always-true | Warning (advisory) | UX edge cases; do not block goal achievement |

These findings exist but the phase goal — "owner can run their entire monthly financial tracking workflow manually" — is achieved. Per orchestrator instruction, code review findings are advisory and do not block verification.

### Human Verification Required

5 items require human/visual confirmation:

1. **Run full Playwright E2E suite against running Next dev server**
   - Expected: All 38 tests pass (18 Phase 1 + 20 Phase 2)
   - Why human: Plan 09 SUMMARY explicitly notes `npm run test:e2e` was NOT executed in worktree — only static analysis (tsc, eslint, playwright --list). Spinning up dev server + running browser tests is required to certify the contracted Wave-5 verification gate.

2. **Mobile responsive behavior at ≤375px**
   - Expected: KPI cards stack, MonthPicker reachable, MobileBottomNav visible, AddFab tappable, Sheet opens from bottom
   - Why human: Visual verification of CSS breakpoints (sm:grid-cols-3, sm:hidden, side="bottom") best confirmed with real device viewport.

3. **Recharts category bar chart drilldown click → navigation**
   - Expected: Clicking a bar navigates to /transacciones?cat={uuid}&mes={month}
   - Why human: SVG click-handler payloads vary by Recharts version; e2e test exists but bar selector (.recharts-bar rect) is fragile.

4. **Sonner Deshacer 5-second undo flow**
   - Expected: Toast shows for ~5s with Deshacer button; click restores row + shows "Transacción restaurada"
   - Why human: Real-time UI behavior; code path verified.

5. **Spanish copy visual rendering across empty/loading/error states**
   - Expected: All 11+ verbatim strings render correctly with accents
   - Why human: All copy verified as string literals; final visual confirmation across paths is human-only.

### Gaps Summary

No goal-blocking gaps identified. The Phase 2 codebase delivers all 5 ROADMAP success criteria with substantive implementation:

- 88 unit tests pass (format + dedup)
- 11 aggregate integration tests pass against live Neon
- 10 Server Action integration tests pass against live Neon (with PII redaction confirmed in logs)
- Live Neon DB has the 3 new tables, 14 seeded categories, 1 'Efectivo' account
- TypeScript strict mode compiles, ESLint --max-warnings=0 passes, Next.js production build succeeds
- All 19 phase requirement IDs (MAN-01..05, LIST-01..05, DASH-01..07, UX-02, UX-03) traced to implementation + test
- All Spanish copy verified as verbatim string literals

The status is **human_needed** rather than **passed** because:

1. Plan 09 (Wave 5) E2E suite has NOT been executed end-to-end against a running dev server (Plan 09 SUMMARY explicitly documents this gap). The 20 Phase 2 e2e tests are syntax-valid and parse correctly via `playwright test --list`, but the contracted "all e2e tests pass" Wave-5 gate requires actual browser execution.
2. Mobile responsive behavior, real-time toast timing, and visual Spanish copy rendering are inherently human-verifiable concerns.

Code review (`02-REVIEW.md`) surfaced 3 advisory critical findings + 9 warnings + 6 info items. Per orchestrator instruction these are advisory and not blocking for goal achievement; they describe edge-case data-integrity and timezone correctness issues that should be addressed in a follow-up but do not prevent the Phase 2 backstop value from being delivered.

---

_Verified: 2026-05-02T13:20:00Z_
_Verifier: Claude (gsd-verifier)_
