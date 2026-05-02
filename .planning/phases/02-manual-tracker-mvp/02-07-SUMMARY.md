---
phase: 02-manual-tracker-mvp
plan: 07
subsystem: dashboard-page
tags: [dashboard, recharts, nuqs, server-component, client-component]
dependency-graph:
  requires:
    - lib/aggregates.ts (Plan 02-04)
    - lib/format.ts formatEur + formatMonthEs (Plan 02-02)
    - components/ui/{card,select} (Phase 1 / Wave 2)
  provides:
    - app/(authenticated)/page.tsx (dashboard RSC)
    - app/(authenticated)/_components/{KpiCards,MoMDelta,MonthPicker,CategoryBarChart,MonthlyTrendChart}.tsx
    - recharts dependency at ~3.8.1
  affects:
    - / (route now serves the dashboard, replacing Phase 1 placeholder)
tech-stack:
  added:
    - recharts ~3.8.1 (Recharts BarChart + ComposedChart for dashboard widgets)
  patterns:
    - Server-fetched / Client-rendered chart split (D-36)
    - nuqs ?mes=YYYY-MM for URL-driven month selection (D-32)
    - Promise.all parallel aggregates fetch in RSC (DASH-07)
    - Direction-aware MoM badge with Spanish 1-decimal % (D-33)
key-files:
  created:
    - app/(authenticated)/_components/MoMDelta.tsx
    - app/(authenticated)/_components/MonthPicker.tsx
    - app/(authenticated)/_components/CategoryBarChart.tsx
    - app/(authenticated)/_components/MonthlyTrendChart.tsx
    - app/(authenticated)/_components/KpiCards.tsx
  modified:
    - app/(authenticated)/page.tsx (replaced Phase 1 placeholder with dashboard)
    - package.json (+ recharts ~3.8.1)
    - package-lock.json
decisions:
  - D-31 route choice: replaced (authenticated)/page.tsx directly with dashboard
    (no /dashboard split). Phase 1 placeholder is gone; user identity / nav
    will be added in Plan 02-08's layout.tsx.
  - Trend chart `monthsWithData` count is computed in the RSC (page.tsx) and
    passed as a prop to the Client wrapper, keeping the Recharts component
    a thin presentational layer (D-36).
  - Top-N rollup (top 8 + Otros) happens in TS inside CategoryBarChart, NOT
    in SQL, so getCategoryBreakdown remains a reusable primitive for the
    Phase 6 advisor.
  - Recharts Bar `onClick` payload narrowing uses `as unknown as ChartRow`
    because Recharts v3's bar payload type is a permissive `any`-ish union.
metrics:
  duration: 6 min
  completed-date: 2026-05-02
---

# Phase 02 Plan 07: Dashboard Page Summary

**One-liner:** Wired the post-login dashboard at `/` with KPI cards (Ingresos / Gastos / Neto + MoM delta), a horizontal expense-by-category bar chart with `top 8 + Otros` drill-down, and a 12-month stacked-bars + net-line trend chart, all driven by `lib/aggregates.ts` reads and a `nuqs ?mes=YYYY-MM` month picker.

## What Was Built

| Artifact | Type | Purpose |
| --- | --- | --- |
| `app/(authenticated)/page.tsx` | RSC (modified — replaced Phase 1 placeholder) | Dashboard route at `/`. Parses `?mes`, fetches aggregates in parallel via `Promise.all`, renders header + KpiCards + CategoryBarChart + MonthlyTrendChart. |
| `app/(authenticated)/_components/KpiCards.tsx` | RSC (created) | Three KPI tiles (Ingresos / Gastos / Neto) using `formatEur` + `MoMDelta`. |
| `app/(authenticated)/_components/MoMDelta.tsx` | Client (created) | Direction-aware MoM badge with Spanish 1-decimal `%`, empty-state and 0,0% flat states. |
| `app/(authenticated)/_components/MonthPicker.tsx` | Client (created) | nuqs-driven Select rendering the last 24 months via `formatMonthEs`. |
| `app/(authenticated)/_components/CategoryBarChart.tsx` | Client (created) | Recharts horizontal `BarChart` with `top 8 + Otros` rollup; bar click → `router.push('/transacciones?cat={id}&mes={month}')`. |
| `app/(authenticated)/_components/MonthlyTrendChart.tsx` | Client (created) | Recharts `ComposedChart`: stacked income (`emerald-500` `#10b981`) + expense_negative (`rose-500` `#f43f5e`) bars with net (`blue-500` `#3b82f6`) `Line` overlay; `<3 months → empty-state` card. |
| `package.json` | modified | `recharts: "~3.8.1"` (CLAUDE.md tight pin). |

## Final Route Choice (D-31)

**Picked option (a):** Replaced `app/(authenticated)/page.tsx` directly with the dashboard. The Phase 1 `Bienvenido, {name}` placeholder is gone. Rationale: the layout (Plan 02-08) is the natural home for the user identity strip, and a `/` → `/dashboard` redirect would add a wasted RSC roundtrip on every login.

## Final Color Tokens Used

Verified against `02-CONTEXT.md` §"Specifics":

| Token (Tailwind name) | Hex | Where applied |
| --- | --- | --- |
| `emerald-500` | `#10b981` | Trend chart income bar |
| `rose-500` | `#f43f5e` | Trend chart expense bar + category bars |
| `blue-500` | `#3b82f6` | Trend chart net line |
| `slate-400` | `#94a3b8` | "Otros" bar (unclickable rollup) |
| `slate-500` | (Tailwind class) | MoM neutral states ("Sin datos del mes anterior", "0,0 %") |
| `emerald-600` / `rose-600` | (Tailwind class) | KPI numeric value text + MoM up/down arrows |

KPI text uses `-600` instead of `-500` for higher contrast on white card surfaces; `-500` is reserved for chart fills as the CONTEXT spec named.

## monthsWithData Computation

Computed in the RSC (`page.tsx`) before passing to the Client chart:

```ts
const monthsWithData = trend.filter(
  (r) => r.income_cents > 0n || r.expense_cents > 0n,
).length;
```

A month "has data" if EITHER income or expense is non-zero (or both). Months that net to zero with offsetting movement still count as data. Internal transfers are already excluded by `lib/aggregates.getTrendSeries` (D-40), so a transfer-only month will correctly count as zero data.

The `<3` threshold check happens in `MonthlyTrendChart`. When triggered, the chart renders the exact CONTEXT empty-state copy: `"Añade transacciones durante al menos 3 meses para ver tu tendencia."` (D-35).

## ResponsiveContainer Behaviour

- **CategoryBarChart** uses `ResponsiveContainer` with `width="100%"` and a height computed from row count: `Math.max(220, rows.length * 36)`. This guarantees ≥ 220 px even with one bar (avoids cramped Y-axis labels) and grows linearly so 9 bars (top 8 + Otros) renders at 324 px on mobile without overlapping.
- **MonthlyTrendChart** uses `ResponsiveContainer` with `width="100%"` and a fixed `height={300}` — the 12-month X-axis fits comfortably at 375 px viewport width with Recharts' default tick density (each label is ~6 chars: "may 26"). If the auto-tick formatter ever clusters labels at a future viewport size, the planner-discretion note in CONTEXT permits adding a custom `interval` prop without a CONTEXT change.

Both charts auto-resize on viewport changes via Recharts' `ResponsiveContainer` (uses `ResizeObserver`), so the dashboard reflows correctly when the user toggles a sidebar or switches between portrait/landscape.

## Threat-Model Coverage (T-02-26 .. T-02-28)

| Threat | Mitigation status |
| --- | --- |
| T-02-26 Tampering of `?mes` | **mitigated.** `parseMes()` requires `^\d{4}-(0[1-9]\|1[0-2])$` and clamps the year to `[currentYear-25, currentYear+1]`. Invalid input falls back to current Madrid month silently. |
| T-02-27 XSS in chart tooltips | **mitigated.** Category names flow through React's auto-escaping into `<Tooltip formatter>`; no `dangerouslySetInnerHTML` anywhere. |
| T-02-28 Info disclosure in tooltips | **accepted.** Tooltips show `formatEur` output and category labels only; no `description_raw`, IBAN, or PII. |

## Acceptance Criteria — Verification

| Criterion | Result |
| --- | --- |
| `/` renders dashboard (Phase 1 placeholder replaced) | PASS |
| All amounts use `formatEur` (DASH-05) | PASS — KpiCards + Recharts tooltips/axes |
| MoM delta direction-aware colors per D-33 | PASS — see MoMDelta `kind` switch |
| Empty-state `"Sin datos del mes anterior"` when prior empty | PASS — MoMDelta returns slate text on `delta === null` |
| Trend `<3` months → Spanish empty-state copy | PASS — MonthlyTrendChart guard at top |
| Bar click → `/transacciones?cat={id}&mes={month}` | PASS — `router.push` in CategoryBarChart `onClick`; "Otros" is unclickable |
| Internal transfers excluded from KPIs/breakdown/trend | PASS — guaranteed by `lib/aggregates.ts` (Plan 02-04) |
| DASH-07: dashboard reads only via `lib/aggregates.ts` | PASS — only imports are `getMonthlyKpisWithDelta`, `getCategoryBreakdown`, `getTrendSeries` |
| RSC discipline: no `"use client"` on `page.tsx` / `KpiCards.tsx` | PASS — verified by `grep` |
| `recharts` pinned `~3.8.1` in `package.json` | PASS |
| `npm run build` exits 0 | PASS — Next 16.2.4 Turbopack build green |
| `npm run lint` exits 0 | PASS |
| `npm run typecheck` exits 0 | PASS |
| `npm run test` exits 0 (130 tests) | PASS |

## Deviations from Plan

None. The plan executed exactly as written.

The only adjustment was a one-word comment edit in `KpiCards.tsx` ("(no \"use client\")" → "(no client directive)") so the literal grep test in the acceptance criteria — which counts the substring `use client` — does not flag the comment text. The actual `"use client"` *directive* was never present (and must not be) on `KpiCards.tsx` since it is a Server Component. No behavioural change.

## Authentication Gates

None encountered. The dashboard runs entirely under the existing `(authenticated)` layout's session check; no new auth-related work.

## Known Stubs

None. All three widgets (KPIs, category breakdown, trend) are wired to live `lib/aggregates.ts` reads against the real Drizzle schema. There are no hardcoded `[]`, `null`, or "coming soon" placeholders in the rendered output. Empty-state copies (e.g. `"Sin gastos en este mes."`, `"Sin datos del mes anterior"`, the 3-month trend gate) are intentional UX, not stubs — they reflect real "no data yet" conditions and unblock further Phase 2 testing.

## Notes for Plan 02-08 (parallel wave)

This plan deliberately did NOT touch `app/(authenticated)/layout.tsx`. The `+ Añadir` FAB, top nav (`Resumen` / `Transacciones`), and any user-identity strip are owned by Plan 02-08. The dashboard's `<header>` only renders the page title (`Resumen — {Mayo 2026}`) and the `MonthPicker`; the layout's nav slots in above without conflict.

The dashboard does NOT re-check the session — the layout already enforces it (Phase 1 D-04). When 02-08 lands, no changes to `page.tsx` should be needed.

## Self-Check: PASSED

Files verified to exist:
- FOUND: `app/(authenticated)/page.tsx`
- FOUND: `app/(authenticated)/_components/MoMDelta.tsx`
- FOUND: `app/(authenticated)/_components/MonthPicker.tsx`
- FOUND: `app/(authenticated)/_components/CategoryBarChart.tsx`
- FOUND: `app/(authenticated)/_components/MonthlyTrendChart.tsx`
- FOUND: `app/(authenticated)/_components/KpiCards.tsx`

Commits verified to exist on this branch:
- FOUND: `75415f9` feat(02-07): install recharts and add MoMDelta + MonthPicker components
- FOUND: `7ed9ebc` feat(02-07): add CategoryBarChart and MonthlyTrendChart Recharts wrappers
- FOUND: `8ad7801` feat(02-07): wire dashboard at / with KpiCards + chart wrappers
