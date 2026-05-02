---
phase: 02-manual-tracker-mvp
plan: 06
subsystem: transactions-list-page
tags:
  - rsc-page
  - searchparams
  - nuqs
  - filters
  - multi-select-popover
  - pagination
  - row-actions
  - source-badge
  - error-boundary
  - sonner-undo
  - quickaddsheet-mount
dependency_graph:
  requires:
    - 02-01-PLAN  # transactions/categories/accounts schema
    - 02-02-PLAN  # shadcn primitives (table, badge, popover, checkbox, skeleton)
    - 02-03-PLAN  # softDeleteTransaction / restoreTransaction Server Actions
    - 02-04-PLAN  # getTransactionsList aggregate (q/min/max/desde/hasta/cat/pag inputs)
    - 02-05-PLAN  # QuickAddSheet + CategorySelect (mounted on this page)
  provides:
    - "/transacciones page route (consumed by Phase 2 Plan 08 nav 'Transacciones' link)"
    - SourceBadge component (Phase 4 will extend with 'psd2' bank-name variants)
    - Pagination component (50/page, nuqs-bound — reusable shape for future list views)
    - Filters component with multi-select category Popover (LIST-03 / D-28)
    - RowActions component with sonner Deshacer-toast soft-delete pattern
    - Route-level error.tsx with verbatim LIST-05 Spanish copy
  affects:
    - "app/(authenticated)/transacciones/page.tsx (created)"
    - "app/(authenticated)/transacciones/error.tsx (created)"
    - "app/(authenticated)/transacciones/_components/ (5 new files)"
    - "app/layout.tsx (NuqsAdapter wired — Rule 3 deviation)"
tech_stack:
  added:
    - "nuqs/adapters/next/app NuqsAdapter mounted at app/layout.tsx (was missing — would have crashed every useQueryState call)"
  patterns:
    - "RSC page reading searchParams: Promise<...> with defensive inline parsers (T-02-20..23 mitigations)"
    - "parseAsArrayOf(parseAsString) for comma-separated multi-select URL state (LIST-03)"
    - "Popover + Checkbox grouped-by-kind Multi-select widget (Gastos / Ingresos / Movimientos)"
    - "useTransition wrapping every URL filter mutation so RSC re-fetch happens off the input thread"
    - "sonner toast with action button for 5-second Deshacer undo window (D-30)"
    - "Route-specific error.tsx overriding app/error.tsx via Next's most-specific match"
    - "Suspense + Skeleton fallback inside the page boundary (5-row 12px height)"
    - "Sign convention rendered at presentation: '+' / '−' / no-sign by category.kind (D-26)"
key_files:
  created:
    - "app/(authenticated)/transacciones/page.tsx"
    - "app/(authenticated)/transacciones/error.tsx"
    - "app/(authenticated)/transacciones/_components/TransactionList.tsx"
    - "app/(authenticated)/transacciones/_components/Filters.tsx"
    - "app/(authenticated)/transacciones/_components/SourceBadge.tsx"
    - "app/(authenticated)/transacciones/_components/RowActions.tsx"
    - "app/(authenticated)/transacciones/_components/Pagination.tsx"
  modified:
    - "app/layout.tsx (added NuqsAdapter)"
decisions:
  - "Default category fallback chain: last-used non-deleted manual category (most-recent imported_at) → first 'expense' kind by sortOrder → null (D-24)"
  - "Suspense + Skeleton rendered inside page.tsx between Filters and Pagination, scoped to the list table only — header and filter bar render immediately while the list streams"
  - "Empty-state copy switches between LIST-05 strings via the hasFilters boolean computed in page.tsx (filtered → 'No hay transacciones que coincidan con los filtros'; pristine → 'Aún no has añadido ninguna transacción')"
  - "Route-specific error.tsx overrides app/error.tsx — Next's most-specific match wins (no import wiring needed)"
  - "Sonner toast 5s window vs Server Action restore: window enforced client-side via toast duration: 5000; restoreTransaction itself has no time gate (idempotent restore — could be called from Phase 7 Papelera UI)"
  - "Multi-select Popover trigger uses base-ui's render prop to compose the Button — works with @base-ui/react/popover; no asChild prop needed"
metrics:
  duration_minutes: 6
  tasks_completed: 4
  files_created: 7
  files_modified: 1
  completed_date: "2026-05-02"
requirements:
  - LIST-01
  - LIST-02
  - LIST-03
  - LIST-04
  - LIST-05
  - MAN-04
  - MAN-05
  - UX-02
  - UX-03
---

# Phase 2 Plan 06: /transacciones list page Summary

**One-liner:** RSC `/transacciones` page that lists soft-delete-aware transactions with URL-bound filter bar (text + amount range + date range + multi-select category Popover), 50-per-page pagination, sonner Deshacer-undo soft-delete row actions, the manual-vs-synced "Manual" badge, and a route-specific error boundary — completes ROADMAP success criteria 2 and 5 for Phase 2.

## What was built

### Page route (Server Component)
**`app/(authenticated)/transacciones/page.tsx`** — async RSC that:
1. Reads `searchParams` (Next 16 Promise-shape) with defensive inline parsers for each key (200-char cap on `q`, `parseEurInput` with safe-fallback on `min`/`max`, UUID-regex filter on comma-split `cat`, `[1, 10000]` clamp on `pag`).
2. Parallel-fetches: full categories list (for both Filters Popover and QuickAddSheet), `getTransactionsList(inputs)`, default category (last-used → first expense → null), and the optional `editTarget` row (when `?editar={id}`).
3. Renders header → `<Filters />` → `<Suspense>{<TransactionList />}</Suspense>` → `<Pagination />` → `<QuickAddSheet />`. The Sheet is mounted unconditionally so AddFab (`?nuevo=1`) and RowActions (`?editar={id}`) open it without a navigation.
4. `metadata.title = "Transacciones — Contabilidad Personal"` for the browser tab.

### List table (Server Component)
**`_components/TransactionList.tsx`** — pure-presentational; receives `{ page, hasFilters }` props. Columns: Fecha (DD/MM/YYYY via `formatDateShortEs`), Descripción + `<SourceBadge />`, Categoría, Importe (signed via `category.kind` — `+` emerald-600 income / `−` rose-600 expense / no-sign slate-600 transfer per D-26), Cuenta (Phase 2 dash placeholder), Acciones (`<RowActions id={r.id} />`). Mobile fallback surfaces the category as a small caption under the description when the Categoría column is hidden (<sm).

### Filters bar (Client, multi-select per LIST-03)
**`_components/Filters.tsx`** — binds `q` / `min` / `max` / `desde` / `hasta` / `cat` / `pag` to URL via `nuqs`. The category filter is the contracted multi-select:
- `parseAsArrayOf(parseAsString)` produces the `cat=uuid1,uuid2,...` URL form (D-28 verbatim).
- Popover trigger labeled `Categorías ({n})` opens a Checkbox list grouped by `kind` in fixed order (Gastos → Ingresos → Movimientos) — same ordering as the QuickAddSheet CategorySelect for visual consistency.
- "Limpiar categorías" clears just `cats`; "Limpiar filtros" resets every key.
- Every URL mutation is wrapped in `startTransition` so the RSC re-fetch happens off the input thread; typing in the search box stays smooth.
- Every filter mutation also resets `pag=null` so the user does not land on a stale page.

### Row actions (Client, sonner Deshacer)
**`_components/RowActions.tsx`** — Edit writes `?editar={id}` via `nuqs` (QuickAddSheet reactively opens). Borrar calls `softDeleteTransaction(id)`; on success raises a sonner toast `"Transacción borrada"` with `Deshacer` action button visible for `duration: 5000`. Clicking Deshacer calls `restoreTransaction(id)` and surfaces success/error as a follow-up toast. Failures from softDelete itself surface as `toast.error("No se ha podido borrar. Reintenta.")`.

### Pagination (Client)
**`_components/Pagination.tsx`** — `useQueryState("pag")`-bound prev/next nav. Renders `Página X de Y · N transacciones` (using `toLocaleString('es-ES')` for the Spanish-thousands count). Anterior disabled at page 1; Siguiente disabled at the last page. Hides itself when `total === 0` (the empty-state copy comes from `<TransactionList />`). Going back to page 1 drops `?pag=` from the URL so the canonical first-page URL stays clean.

### Source badge (presentational)
**`_components/SourceBadge.tsx`** — wraps shadcn `<Badge variant="secondary">Manual</Badge>` for `source='manual'`. Returns `null` for any other source value. Phase 4 will extend with bank-name variants for `source='psd2'`.

### Route-level error boundary (Client)
**`app/(authenticated)/transacciones/error.tsx`** — overrides `app/error.tsx` for /transacciones errors. Renders the verbatim LIST-05 copy (`"No se han podido cargar las transacciones. Reintenta."`) with a `Reintentar` button calling Next.js `reset()`. Logs only `error.digest` via `logger.error` — never the raw error string (T-02-26 mitigation: could carry user input or stack PII).

## Threat model — verified mitigations

| Threat ID | Mitigation in this plan |
|-----------|-------------------------|
| T-02-20 (q tampering) | `q.slice(0, 200)` cap before passing to `ilike()` (Plan 04 already binds `%${q}%` as a single parameter) |
| T-02-21 (min/max tampering) | `parseEurInput` in a try/catch — failure → undefined → filter ignored (fail-safe) |
| T-02-22 (cat tampering) | Comma-split, each entry filtered by strict UUID regex; empty → undefined; downstream `inArray()` is parameterized |
| T-02-23 (pag tampering) | `Number.isFinite + clamp [1, 10000]`; out-of-range → page 1 |
| T-02-24 (XSS in description_raw) | All strings rendered via JSX text interpolation; no `dangerouslySetInnerHTML` anywhere in this plan |
| T-02-25 (IDOR on softDelete) | Single-owner project; Plan 03 `ensureSession()` is the gate; documented for Phase 7 multi-principal hardening |
| T-02-26 (info disclosure in error.tsx) | Logs only `error.digest` — never `error.message` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Mounted NuqsAdapter at root layout**
- **Found during:** Pre-Task 1 environment check (verified all existing `nuqs` callers — MonthPicker, AddFab-adjacent, QuickAddSheet — would crash without it).
- **Issue:** `nuqs/adapters/next/app` was never mounted in any layout. With `nuqs@2.x` on Next 16 App Router, every `useQueryState()` call requires the adapter or it throws "useAdapter() called outside Adapter" at first client render. The dashboard `MonthPicker` (Plan 02-07), the `QuickAddSheet` (Plan 02-05), and every Plan 02-06 client component would have crashed.
- **Fix:** Wrapped `{children}` in `<NuqsAdapter>` inside `app/layout.tsx`. Added a comment explaining the dependency.
- **Files modified:** `app/layout.tsx`
- **Commit:** `6b877b4` (`fix(02-06): wire NuqsAdapter in root layout for URL state`)

No other deviations — plan executed exactly as written for Tasks 1–4.

## Self-Check: PASSED

Files verified to exist:
- FOUND: `app/(authenticated)/transacciones/page.tsx`
- FOUND: `app/(authenticated)/transacciones/error.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/TransactionList.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/Filters.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/SourceBadge.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/RowActions.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/Pagination.tsx`
- FOUND: `app/layout.tsx` (modified — NuqsAdapter mounted)

Commits verified to exist:
- FOUND: `6b877b4` fix(02-06): wire NuqsAdapter in root layout for URL state
- FOUND: `c432b1c` feat(02-06): add SourceBadge, Pagination, RowActions components
- FOUND: `f6760b9` feat(02-06): add multi-select Filters bar with nuqs URL state
- FOUND: `e20ce81` feat(02-06): add /transacciones RSC page and TransactionList component
- FOUND: `1de54b8` feat(02-06): add route-specific error boundary for /transacciones (LIST-05)

Verification gates:
- `npm run lint` → exit 0
- `npm run typecheck` → exit 0
- `npm run build` → exit 0 (route printed as `ƒ /transacciones` — dynamic SSR)
- `npm test` → 130/130 passed (no test files added in this plan; integration tests for the page are deferred to Plan 09 E2E per CONTEXT)

## Notes

### Final structure of the page (RSC + client islands)

```
page.tsx (RSC, async)
├── <header> Transacciones
├── <Filters categories={...} />        ← Client (nuqs + Popover + Checkbox)
├── <Suspense fallback={5×Skeleton}>
│     └── <TransactionList page hasFilters />   ← RSC
│              ├── <SourceBadge />     ← presentational
│              └── <RowActions />      ← Client (sonner + nuqs + Server Actions)
│   </Suspense>
├── <Pagination page pageSize total /> ← Client (nuqs)
└── <QuickAddSheet ...defaults />      ← Client (Plan 02-05; mounted, opens via ?nuevo / ?editar)
```

### Multi-select category filter (LIST-03 / D-28) — implementation notes

- nuqs hook: `useQueryState("cat", parseAsArrayOf(parseAsString).withDefault([]))`.
- URL serialization (verified by inspection of `node_modules/nuqs/dist`): array items are joined with `,`, producing exactly the `cat=uuid1,uuid2,...` form D-28 specifies.
- The Popover renders the Checkbox list grouped by `Category.kind` in fixed order (Gastos / Ingresos / Movimientos).
- Backend coupling: `getTransactionsList` (Plan 04) already accepts `cat?: string[]` and binds via parameterized `inArray()`. No backend change needed in this plan.
- The page-level parser (`safeUuidArr` in `page.tsx`) splits the URL value on `,`, applies a UUID regex, and drops invalid entries silently — defense-in-depth on top of the parameterized aggregate query.

### Default category fallback chain

Implemented in `page.tsx:defaultCategoryId()`:
1. `SELECT category_id FROM transactions WHERE soft_deleted_at IS NULL ORDER BY imported_at DESC LIMIT 1`.
2. If empty: `SELECT id FROM categories WHERE kind='expense' ORDER BY sort_order LIMIT 1`.
3. If still empty (no categories seeded): `null` — `<QuickAddSheet />` renders an unselected Select.

### Suspense + Skeleton placement

- Suspense boundary wraps **only** `<TransactionList />`. The page header and filter bar render immediately on every navigation; only the table region streams.
- Fallback: `<div className="space-y-2 p-4">` containing 5 `<Skeleton className="h-12 w-full" />` rows.
- Skeleton design matches CONTEXT "Skeleton row design" guidance (planner discretion: 5 rows, ~50px height, animated pulse via the shadcn Skeleton's `animate-pulse` utility).

### Error boundary — route-specific (not global)

- `app/(authenticated)/transacciones/error.tsx` is a Client Component (`'use client'`) that takes `{ error, reset }` per Next.js convention.
- Next.js automatically picks the most-specific `error.tsx`: this file overrides `app/error.tsx` for any error thrown inside `/transacciones` — no import wiring needed.
- Verbatim LIST-05 Spanish copy: `"No se han podido cargar las transacciones. Reintenta."` headline + `Reintentar` button.
- Logs only `error.digest` via `logger.error`. The error.tsx file deliberately contains zero references to `error.message` (verified by `grep -c 'error.message' = 0`).
