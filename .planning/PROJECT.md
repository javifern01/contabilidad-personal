# Contabilidad Personal

## What This Is

A personal finance web app for a single user (the owner) to track monthly income and expenses, monitor overall financial health, and receive AI-powered, natural-language recommendations on how to improve their financial habits. Spanish UI, EUR-only, with PSD2 bank sync (ING, N26, Revolut, CaixaBank/imagin) plus manual entry. Hosted on Vercel with a managed Postgres database.

## Core Value

**Turn raw bank transactions into actionable, personalized financial advice in Spanish.** If everything else fails, the user must be able to see their monthly cash flow and get useful recommendations on how to improve it.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**v1 — MVP (this milestone):**

- [ ] Connect at least one Spanish bank account via PSD2 (ING, N26, Revolut, or CaixaBank/imagin) and import transactions automatically
- [ ] Add transactions manually (income or expense) with amount, date, description, category
- [ ] Categorize transactions using a hybrid engine: rule-based first (e.g., `MERCADONA → Supermercado`), LLM fallback for unrecognized merchants
- [ ] Allow user to override / correct any category, with the override fed back to improve future categorization
- [ ] Monthly dashboard showing total income, total expenses, net cash flow, and breakdown by category
- [ ] Visualize trends over the last 6–12 months (income, expenses, by category)
- [ ] AI advisor: analyze recent spending patterns and produce 3–5 personalized recommendations in Spanish, in natural language
- [ ] Single-user authentication (the owner only)
- [ ] All UI and AI output in Spanish
- [ ] EUR-only amounts

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Multi-user / family / multi-tenant** — Single user only by design; no auth complexity, no shared categories, no permissions
- **Net worth tracking (assets vs liabilities)** — Deferred to milestone 2; needs validated baseline before adding complexity
- **Investment portfolio (stocks, ETFs, crypto)** — Deferred to milestone 2 or later; manual-only when added; no broker integrations planned
- **Budget targets per category** — Deferred to milestone 2; useful but not core to "see health + get advice"
- **Savings goals tracking** — Deferred to milestone 2
- **Receipt photo / OCR ingestion** — Deferred; manual + bank sync covers the 95% case
- **CSV/file import** — Deferred; PSD2 covers all listed banks, can revisit if needed
- **Multi-currency** — EUR only; user's Revolut/Wise foreign-currency txns will be normalized to EUR at the import-time rate
- **Mobile native app (iOS/Android)** — Web-only; responsive design must be good on mobile browser
- **Local-only / self-hosted modes** — Cloud (Vercel + managed Postgres) is the only target deployment for v1
- **Spanish tax / IRPF / Verifactu features** — This is a *personal finance* tool, not a fiscal/business accounting tool. Out of scope permanently
- **Real-time push notifications / alerts** — In-app indicators only for v1
- **English / multilingual UI** — Spanish only; no i18n scaffolding in v1

## Context

**Owner profile:** Software developer at Ayesa (Spanish IT services). Building this primarily for personal use. Has not previously used Fintonic, YNAB, Money Lover, or similar — starting fresh, no comparison baseline. Open to stack recommendations rather than imposing one.

**Why this app instead of buying one:** No specific frustration with existing tools (none tried) — this is partly a personal-utility build, partly a hands-on project. The differentiating value is the **AI advisor** producing Spanish-language, personalized recommendations rather than generic threshold alerts.

**Banking ecosystem:** All target banks (ING, N26, Revolut, CaixaBank/imagin) are well-supported by EU PSD2 aggregators (GoCardless Bank Account Data formerly Nordigen, Tink, etc.). PSD2 consents typically expire every 90 days — UX needs to handle re-consent gracefully.

**LLM cost expectation:** Single user, monthly analysis cadence → expected LLM spend is a few cents to low single-digit euros per month. Not a cost-driven design constraint.

**Data sensitivity:** Bank transaction data is highly sensitive. Even though this is a personal app, the architecture must treat the database as a trust boundary (encryption at rest, secrets in vault, no PII in logs).

## Constraints

- **Tech stack**: Web app deployed on Vercel + managed Postgres (Supabase/Neon-class) — Constrains: serverless-friendly stack (Next.js / SvelteKit / similar), no long-running background workers without scheduled jobs or a queue
- **Hosting**: Cloud-only (Vercel + managed DB) — Required for PSD2 callback URLs and consistent access
- **Banking integration**: Must use a regulated PSD2 AISP aggregator — Direct bank scraping is illegal/unstable; aggregator API key cost (often free tier) accepted
- **Language**: Spanish only for UI and AI output — All copy, error messages, and LLM prompts produce Spanish
- **Currency**: EUR only — Foreign-currency transactions normalized to EUR at import time
- **Single-user**: One account, one owner — No invitations, no sharing, no role system
- **Categorization correctness**: User must always be able to override the engine — Wrong categories ruin advice quality
- **AI advisor must be useful**: Generic advice ("spend less") is failure — Recommendations must reference concrete transactions, amounts, and patterns from the user's actual data
- **Privacy**: Bank credentials never touch the application server (PSD2 redirect flow only); transaction data encrypted at rest

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web app (browser) over native mobile | Single-user personal app; web is fastest to ship and iterate; mobile browser is fine for transaction entry | — Pending |
| Cloud (Vercel + managed DB) over self-hosted/local | PSD2 requires a stable callback URL; managed services minimize ops burden | — Pending |
| LLM-powered AI advisor (vs rule-based) | The differentiating value is personalized advice; cost negligible for single user | — Pending |
| Hybrid categorization (rules + LLM fallback) | Rules cover common Spanish merchants cheaply and deterministically; LLM only for unknowns | — Pending |
| MVP scoped to tracker + AI advisor only | Owner has no usage baseline; ship narrow, validate, expand. Net worth/investments/budgets/goals deferred | — Pending |
| EUR-only, Spanish-only | Simplifies data model and copy; owner is Spain-based | — Pending |
| Stack chosen by GSD research phase | Owner is open to recommendations; let research surface 2025-current best fit | — Pending |
| Single-user (no multi-tenancy) | Personal use only; no auth complexity beyond owner login | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-01 after initialization*
