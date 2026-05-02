---
status: partial
phase: 02-manual-tracker-mvp
source: [02-VERIFICATION.md]
started: 2026-05-02T13:20:00Z
updated: 2026-05-02T13:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Run full Playwright E2E suite against a running Next.js dev server
expected: All 20 Phase 2 e2e tests pass (11 transactions + 9 dashboard) plus all 18 Phase 1 e2e tests still pass — total 38 passing, 0 failing
result: [pending]
how_to_run: `npm run dev` (separate terminal), then `npm run test:e2e`

### 2. Manually exercise the dashboard on a real mobile browser at ≤375px width
expected: MonthPicker dropdown is reachable; KPI cards stack to one column; trend chart adapts to viewport; mobile bottom-tab nav is visible and AddFab tappable
result: [pending]
how_to_run: Chrome DevTools → device toolbar → iPhone SE (375×667) → log in → / and /transacciones

### 3. Visually verify Recharts category bar chart drilldown actually navigates correctly
expected: Clicking a bar in the dashboard's 'Gastos por categoría' chart navigates to /transacciones?cat={uuid}&mes=YYYY-MM and the list filters to that category
result: [pending]
how_to_run: Add ≥2 transactions in different categories, open /, click any bar in the chart

### 4. Confirm sonner toast 'Deshacer' undo flow operates within the 5-second window in a real browser
expected: After clicking 'Borrar' on a row, the toast 'Transacción borrada · Deshacer' appears for ~5 seconds; clicking 'Deshacer' restores the row and shows 'Transacción restaurada' toast
result: [pending]
how_to_run: /transacciones → row 3-dot menu → Borrar → click "Deshacer" before 5s

### 5. Verify Spanish copy renders correctly across all empty/loading/error states
expected: Pristine empty list, filter-empty list, <3-month trend chart, MoM null prior, dedup-collision form error, route-level error.tsx — each renders the verbatim Spanish copy from CONTEXT.md
result: [pending]
how_to_run: New session → empty list → filter to nothing → fresh-month dashboard → submit identical txn twice → trigger error.tsx via thrown query

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(none recorded yet — populate after running tests above)
