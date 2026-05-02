# Roadmap: Contabilidad Personal

## Overview

Contabilidad Personal is a single-user, EUR-only, Spanish personal-finance web app whose differentiating value is a Claude-powered AI advisor that produces grounded, transaction-cited recommendations. The build follows a critical-path linear order: foundation infrastructure first, then a fully usable manual tracker (so the project has standalone value even if external dependencies fail), then deterministic rule-based categorization, then PSD2 bank sync, then LLM categorization fallback for unknown merchants, then the AI advisor on top of three months of categorized data, and finally a polish-and-privacy gate before launch. Phases 1-3 deliver a working manual-only tracker; Phase 4 unlocks automatic ingestion (hard-gated on PSD2 aggregator vendor confirmation); Phase 6 unlocks the differentiator.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Auth** - EU-region Vercel/Neon deployment, money-as-bigint schema, Better Auth single-owner login, encrypted secrets, structured logging *(Completed 2026-05-01)*
- [ ] **Phase 2: Manual Tracker MVP** - Quick-add form, transaction list, monthly dashboard, MoM delta, 6-12 month trend chart — usable end-to-end with zero external deps
- [ ] **Phase 3: Categorization Engine** - Spanish category hierarchy, ≥50 merchant rules, override loop, audit log, transfer detection, "¿Por qué esta categoría?"
- [ ] **Phase 4: PSD2 Bank Sync (HARD-GATED)** - `BankSyncProvider` interface, redirect consent, 90-day initial sync, nightly Inngest cron, compound dedup, re-consent UX, FX handling
- [ ] **Phase 5: LLM Categorization Fallback** - Inngest event consumer, Haiku 4.5 with cached prefix, `merchant_normalized` cache, IBAN/PII strip, cost telemetry
- [ ] **Phase 6: AI Advisor** - SQL-aggregate profile, cached Spanish system prompt, structured JSON output, hallucination validator, monthly cron + on-demand
- [ ] **Phase 7: Polish, Privacy & Validation Gate** - CSV export, account deletion + consent revocation, privacy policy, mobile testing, locale snapshot tests, DST edge tests

## Phase Details

### Phase 1: Foundation & Auth
**Goal**: A deployed-and-secure EU foundation that owner can log into and that future phases can build on without revisiting infrastructure decisions.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Owner can navigate to the deployed app, log in with email/password, and see an authenticated landing page in Spanish
  2. Failed login attempts are rate-limited (5 per 15 minutes per IP) and recorded in an audit log alongside successes
  3. The session survives browser refresh and a Vercel redeploy
  4. The database schema stores monetary amounts as `BIGINT` minor units, timestamps as `TIMESTAMPTZ`, and PSD2-token columns are encrypted at rest with AES-256-GCM
  5. Application logs of a sensitive payload show no `description_raw`, IBAN, password, or access token (redacted in production logs)
**Plans**: 8 plans
Plans:
- [ ] 01-01-PLAN.md — Bootstrap Next.js 16 + React 19 + TS strict + Tailwind v4 + ESLint flat + Prettier + project layout + vercel.json fra1 + Spanish root layout
- [ ] 01-02-PLAN.md — GitHub Actions CI (lint/typecheck/test/drizzle-check, D-15) + shadcn/ui Phase 1 components + Vitest scaffold
- [ ] 01-03-PLAN.md — Drizzle schema (Better Auth tables + auth_audit_log per D-08/D-13) + migration runner + lib/db.ts + lib/env.ts + [BLOCKING] schema sync to live Neon EU
- [ ] 01-04-PLAN.md — lib/crypto.ts AES-256-GCM helper with full TDD coverage (D-01/D-02/D-03)
- [ ] 01-05-PLAN.md — lib/format.ts Spanish-locale helpers with DST tests (D-11) + lib/logger.ts Pino with redact paths and IBAN regex (D-14)
- [ ] 01-06-PLAN.md — Better Auth setup + Postgres-window rate-limit per D-12 + Spanish login UI + middleware route guard
- [ ] 01-07-PLAN.md — Authenticated layout + UserMenu dropdown + logout flow (D-07) + Spanish error pages + /api/health + scripts/create-owner.ts (D-05)
- [ ] 01-08-PLAN.md — Playwright E2E acceptance suite covering ROADMAP success criteria + production Vercel deploy verification (fra1 + Neon EU)
**research_required**: false

### Phase 2: Manual Tracker MVP
**Goal**: Owner can run their entire monthly financial tracking workflow manually — add transactions, search/filter, see the monthly cash-flow dashboard with MoM delta and 6-12 month trends — with zero external service dependencies. This is the "if everything else fails" backstop value.
**Depends on**: Phase 1
**Requirements**: MAN-01, MAN-02, MAN-03, MAN-04, MAN-05, LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Owner can add a manual income or expense transaction in ≤4 visible fields on a mobile browser, edit it, soft-delete it, and visually distinguish it from (future) synced transactions
  2. Owner can browse the transaction list with search-by-description, filter by amount range / date range / multi-select category, paginated 50-per-page in stable `booked_at` desc order
  3. Owner sees a monthly dashboard with total income, total expenses, net cash flow, expense-by-category bar chart, and arrow+percentage MoM delta — all rendered with `Intl.NumberFormat('es-ES', { currency: 'EUR' })` and `DD/MM/YYYY` dates
  4. Owner sees a 6-12 month trend chart for income, expenses, and net — read entirely from pre-computed data with no synchronous calls to external services
  5. Empty, loading, and error states render explicit Spanish copy on every list and chart
**Plans**: 9 plans across 5 waves
Plans:

**Wave 1** *(parallel; no dependencies)*
- [ ] 02-01-PLAN.md — Drizzle schema (accounts, categories, transactions per D-16/D-18/D-20) + generated migration + seed-categories.ts (14 categories + Efectivo) + [BLOCKING] schema push to live Neon EU
- [ ] 02-02-PLAN.md — shadcn primitives (sheet/select/badge/table/tabs/skeleton/popover/checkbox) + nuqs@~2.8.9 install + lib/format.ts formatMonthEs (D-41) + tests

**Wave 2** *(blocked on Wave 1 completion; parallel within wave)*
- [ ] 02-03-PLAN.md — Server Actions (addTransaction/editTransaction/softDeleteTransaction/restoreTransaction per D-42) + lib/dedup.ts (D-22 SHA-256 minute-truncated) + revalidateTag wiring (D-39)
- [ ] 02-04-PLAN.md — lib/aggregates.ts (5 cached functions: monthly KPIs, MoM delta, category breakdown, trend series, list pagination) per D-37/D-38/D-39/D-40

**Wave 3** *(blocked on Wave 2 completion; parallel within wave)*
- [ ] 02-05-PLAN.md — QuickAddSheet (D-23..D-26 — 4 fields, ?nuevo=1/?editar={id}, sonner toasts) + CategorySelect (kind-grouped Gastos/Ingresos/Movimientos)
- [ ] 02-07-PLAN.md — / dashboard (replaces Phase 1 placeholder) — KpiCards + MoMDelta + CategoryBarChart (top-8+Otros + drilldown) + MonthlyTrendChart (ComposedChart with <3-month empty state) + MonthPicker (D-31..D-36)
- [ ] 02-08-PLAN.md — Authenticated layout: TopNav (Resumen/Transacciones) + AddFab (URL-state-preserving per UX-02) + MobileBottomNav (D-43); preserves Phase 1 session redirect + UserMenu

**Wave 4** *(blocked on Wave 3 completion; consumes QuickAddSheet from 02-05)*
- [ ] 02-06-PLAN.md — /transacciones page (RSC reading nuqs URL state) + Filters (multi-select category Popover per LIST-03 / D-28) + TransactionList + SourceBadge (Manual badge per D-29) + RowActions (Deshacer 5s toast) + Pagination + route-specific error.tsx (LIST-05) (D-27..D-30)

**Wave 5** *(blocked on Wave 4 completion; final E2E gate)*
- [ ] 02-09-PLAN.md — Playwright E2E covering ROADMAP success criteria 1-5: transactions.spec.ts (MAN+LIST+UX incl. multi-select filter, error.tsx boundary, FAB URL-state preservation) + dashboard.spec.ts (DASH+UX with cat=&mes= drilldown assertion) + fixtures.ts extensions
**UI hint**: yes
**research_required**: false

### Phase 3: Categorization Engine
**Goal**: Every transaction (manual today, synced tomorrow) gets a category through a deterministic rule engine, and every override the owner makes is captured, audited, and offered to apply retroactively to past transactions of the same merchant. This phase locks in the data quality that gates advisor quality.
**Depends on**: Phase 2
**Requirements**: CAT-01, CAT-02, CAT-05, CAT-06, CAT-07, CAT-08, CAT-09
**Success Criteria** (what must be TRUE):
  1. On first run, the database is seeded with a Spanish category hierarchy (≥15 top-level + ≥30 sub-categories) and ≥50 priority-ordered merchant rules covering Mercadona, Carrefour, Lidl, Día, Iberdrola, Endesa, Movistar, Vodafone, Glovo, Renfe, etc.
  2. Owner can override the category of any transaction with a single click and is then prompted to apply the same rule to past N transactions for the same merchant
  3. Every category change (rule, override, transfer) is recorded in an append-only `transaction_categorizations` audit table with source and timestamp, queryable from the UI
  4. The "Traspaso interno" category exists, transfers between owner accounts are excluded from income/expense aggregates on the dashboard, and the dashboard totals visibly change after a transfer is recategorized
  5. The transaction detail UI shows the category source ("¿Por qué esta categoría?" — `rule` / `override` / `transfer` / later `llm`)
**Plans**: TBD
**UI hint**: yes
**research_required**: false

### Phase 4: PSD2 Bank Sync (HARD-GATED)
**Goal**: Owner can connect at least one Spanish bank via redirect-based PSD2 consent, see ~90 days of historical transactions imported and deduplicated, and have new transactions appear daily without ever blocking the UI on aggregator latency. Re-consent at day 90 is friction-free.
**Depends on**: Phase 3
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08, SYNC-09, SYNC-10, SYNC-11, SYNC-12
**Success Criteria** (what must be TRUE):
  1. Owner can connect at least one of {ING, N26, Revolut, CaixaBank/imagin} via a redirect consent flow, and within minutes sees the last 90 days of transactions imported, deduplicated, and rule-categorized
  2. A nightly Inngest cron at 04:00 Europe/Madrid imports incremental transactions; clicking "Sincronizar ahora" enqueues an Inngest job and returns immediately without blocking the UI
  3. A pending transaction transitions to booked in place (no duplicate row); foreign-currency transactions show both `original_amount` and `eur_amount` with `fx_rate_source` recorded
  4. The connections page shows `consent_expires_at` and `last_synced_at`; a re-consent banner appears at T-14, T-7, T-3, T-1, T-0 days; clicking it walks the owner through re-auth without losing transaction history
  5. When sync receives 401/403/`consent_invalid`, the connection flips to `requires_reconsent` and a red banner appears on the dashboard; production environment refuses sandbox bank IDs
**Plans**: TBD
**research_required**: true
**hard_gate**: PSD2 aggregator access must be confirmed before phase planning starts. Resolve Open Question #1 from research/SUMMARY.md: (a) GoCardless via `bankaccountdata@gocardless.com` request, (b) Enable Banking free-personal tier, or (c) Tink/TrueLayer paid. The `BankSyncProvider` interface (SYNC-01) is the architectural mitigation already locked in design.

### Phase 5: LLM Categorization Fallback
**Goal**: When the rule engine cannot match a synced transaction's merchant, an asynchronous Haiku 4.5 call categorizes it, the result is cached by `merchant_normalized` so subsequent transactions hit cache instead of API, and no IBAN or `description_raw` ever leaves the database for the LLM.
**Depends on**: Phase 4
**Requirements**: CAT-03, CAT-04
**Success Criteria** (what must be TRUE):
  1. After a sync, transactions whose merchant matches no rule are categorized by Claude Haiku 4.5 within minutes via an Inngest event consumer (never on the request path)
  2. The same merchant appearing in a future sync is categorized from the `merchant_normalized` cache without an Anthropic API call (verified by cost telemetry showing zero new spend on repeat merchants)
  3. The payload sent to Haiku contains only `merchant_normalized` and aggregate context — no `description_raw`, no IBANs (verified by IBAN-regex strip and a redacted-payload test)
  4. The transaction detail UI shows category source `llm` for these transactions, alongside the Haiku output reasoning, and the owner can override exactly as in Phase 3
**Plans**: TBD
**research_required**: false

### Phase 6: AI Advisor
**Goal**: Owner receives a fresh monthly Spanish-language advisor report with 3-5 recommendations, each citing concrete amounts and merchants from their actual data, with deterministic SQL-computed numbers (the LLM never does math) and an output validator that rejects any hallucinated amount or merchant.
**Depends on**: Phase 5 (and operationally, ≥3 months of categorized data)
**Requirements**: ADV-01, ADV-02, ADV-03, ADV-04, ADV-05, ADV-06, ADV-07, ADV-08, ADV-09, ADV-10, ADV-11, ADV-12, ADV-13, ADV-14
**Success Criteria** (what must be TRUE):
  1. On day 1 of each month at 06:00 Europe/Madrid, an Inngest cron generates a fresh advisor report using Claude Sonnet 4.6 with prompt-cached system prompt + Spanish style guide + JSON schema; "Actualizar análisis" regenerates on demand
  2. The advisor report shows 3-5 recommendations in informal tú-form Spanish, each with `category_targeted`, `current_amount_eur`, `proposed_change_eur`, `expected_monthly_saving_eur`, `rationale_es`, and `confidence` — every cited number traces back to a SQL-computed aggregate, not LLM arithmetic
  3. The output validator rejects any recommendation whose amount or merchant is not present in the input payload, and any recommendation targeting a committed/recurring expense category (rent, utilities, fixed insurance) — verified by adversarial test inputs
  4. With <3 months of categorized data, the advisor refuses to run and shows a friendly "Sigue registrando..." Spanish message; every report carries the non-removable Spanish disclaimer "No es asesoramiento financiero profesional..."
  5. Every report is persisted to `advisor_reports` with model, input/output tokens, and EUR cost; monthly spend over €10 is refused in code (€5 alert configured in Anthropic console); LLM-bound payloads contain no `description_raw` or IBANs (defense-in-depth regex strip applied)
**Plans**: TBD
**UI hint**: yes
**research_required**: true

### Phase 7: Polish, Privacy & Validation Gate
**Goal**: The launch-readiness gate. Owner can export and delete all data with PSD2 consent revocation, the Spanish privacy policy is published, locale and DST behaviors are snapshot-tested, mobile flows work on a real ≤375px-wide device, and stale-data indicators are visible.
**Depends on**: Phase 6
**Requirements**: PRIV-01, PRIV-02, PRIV-03, PRIV-04, PRIV-05, UX-01, UX-04
**Success Criteria** (what must be TRUE):
  1. Owner can export all transactions as a UTF-8 semicolon-separated CSV that opens correctly in Excel-ES with Spanish headers and `DD/MM/YYYY` dates and `1.234,56` decimal commas
  2. Owner can delete their account through a Spanish-language confirmation flow that hard-deletes all owner-owned data AND revokes PSD2 consent with the aggregator (verified end-to-end against a sandbox connection); bank-sourced transactions remain soft-deletable for ≥30 days before hard removal
  3. A Spanish privacy policy page lists data location (EU), all third-party processors (Vercel, Neon, Inngest, Anthropic, PSD2 aggregator), retention periods, and owner rights
  4. Every primary flow (add transaction, view dashboard, override category, connect bank) works on a mobile browser at ≤375px width with ≥44px tap targets, verified on a real device session
  5. Locale snapshot tests cover currency / date / decimal-comma rendering across all currency renders; DST-transition test (2026-10-25) confirms month-boundary aggregations remain correct; a stale-data banner appears when last sync > 24 hours ago
**Plans**: TBD
**UI hint**: yes
**research_required**: false

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 8/8 | Complete | 2026-05-01 |
| 2. Manual Tracker MVP | 0/9 | Not started | - |
| 3. Categorization Engine | 0/TBD | Not started | - |
| 4. PSD2 Bank Sync | 0/TBD | Not started (HARD-GATED) | - |
| 5. LLM Categorization Fallback | 0/TBD | Not started | - |
| 6. AI Advisor | 0/TBD | Not started | - |
| 7. Polish, Privacy & Validation Gate | 0/TBD | Not started | - |

## Coverage Summary

**v1 requirements:** 72 total
**Mapped:** 72 (100%)
**Orphaned:** 0

| Category | Count | Phase(s) |
|----------|-------|----------|
| FND (Foundation) | 6 | Phase 1 |
| AUTH (Auth) | 5 | Phase 1 |
| MAN (Manual entry) | 5 | Phase 2 |
| LIST (Transaction list) | 5 | Phase 2 |
| DASH (Dashboard) | 7 | Phase 2 |
| CAT (Categorization) | 9 | Phase 3 (CAT-01, 02, 05-09 = 7) + Phase 5 (CAT-03, 04 = 2) |
| SYNC (PSD2 sync) | 12 | Phase 4 |
| ADV (AI advisor) | 14 | Phase 6 |
| PRIV (Privacy & data control) | 5 | Phase 7 |
| UX (Cross-cutting) | 4 | Phase 2 (UX-02, 03) + Phase 7 (UX-01, 04) |

## Phase Dependency Notes

- **Phases 1-3 are standalone-valuable.** If PSD2 vendor access falls through completely, the project still ships as a manual-only tracker with rule-based categorization. The core PROJECT.md commitment ("if everything else fails, the user must see their cash flow") is satisfied at the end of Phase 2.
- **Phase 4 is HARD-GATED.** Do not begin phase planning for Phase 4 until Open Question #1 from `research/SUMMARY.md` is resolved (PSD2 aggregator vendor confirmed via GoCardless email, Enable Banking signup, or paid alternative). The `BankSyncProvider` interface (SYNC-01) is in scope for Phase 4 day 1 as architectural insurance.
- **Phases 4 and 6 require fresh research at phase start** (`/gsd-research-phase`): Phase 4 because vendor landscape is volatile and per-bank quirks need sandbox verification; Phase 6 because Anthropic prompt caching and Spanish-finance prompt patterns evolve.
- **Phase 5 is operationally tight with Phase 4.** Once PSD2 sync is live, unknown merchants accumulate immediately. Phase 5 should follow without delay to keep "category source = pending LLM" backlog small.
- **Phase 6 needs ≥3 months of categorized data to produce useful output** (ADV-12 enforces this gate). Owner can begin Phase 6 build as soon as Phase 5 ships, but the advisor will refuse to generate reports until enough categorized history exists. Plan Phase 6 build accordingly.
- **Phase 7 is the validation gate before launch** — all preceding phases can be considered "feature complete" only after Phase 7 verifies privacy/locale/DST/mobile end-to-end.

---
*Roadmap created: 2026-05-01*
*Granularity: standard (target 5-8 phases) — 7 phases derived from requirements*
