<!-- GSD:project-start source:PROJECT.md -->
## Project

**Contabilidad Personal**

A personal finance web app for a single user (the owner) to track monthly income and expenses, monitor overall financial health, and receive AI-powered, natural-language recommendations on how to improve their financial habits. Spanish UI, EUR-only, with PSD2 bank sync (ING, N26, Revolut, CaixaBank/imagin) plus manual entry. Hosted on Vercel with a managed Postgres database.

**Core Value:** **Turn raw bank transactions into actionable, personalized financial advice in Spanish.** If everything else fails, the user must be able to see their monthly cash flow and get useful recommendations on how to improve it.

### Constraints

- **Tech stack**: Web app deployed on Vercel + managed Postgres (Supabase/Neon-class) — Constrains: serverless-friendly stack (Next.js / SvelteKit / similar), no long-running background workers without scheduled jobs or a queue
- **Hosting**: Cloud-only (Vercel + managed DB) — Required for PSD2 callback URLs and consistent access
- **Banking integration**: Must use a regulated PSD2 AISP aggregator — Direct bank scraping is illegal/unstable; aggregator API key cost (often free tier) accepted
- **Language**: Spanish only for UI and AI output — All copy, error messages, and LLM prompts produce Spanish
- **Currency**: EUR only — Foreign-currency transactions normalized to EUR at import time
- **Single-user**: One account, one owner — No invitations, no sharing, no role system
- **Categorization correctness**: User must always be able to override the engine — Wrong categories ruin advice quality
- **AI advisor must be useful**: Generic advice ("spend less") is failure — Recommendations must reference concrete transactions, amounts, and patterns from the user's actual data
- **Privacy**: Bank credentials never touch the application server (PSD2 redirect flow only); transaction data encrypted at rest
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary (read this first)
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js** | **16.2.x** (16.2.4 latest as of May 2026) | Full-stack framework: file-based routing, Server Components, Server Actions, Route Handlers, Middleware | The default React framework on Vercel — first-class deploy target, native Server Actions perfectly fit "form to insert/override transaction" UX, App Router + RSC keep client JS small for a dashboard, Turbopack is stable in `dev` and `build` since v16. Dominant ecosystem (4× the package coverage of Svelte) — every PSD2/charting/auth library has a Next.js example. Confidence: HIGH. |
| **React** | **19.2.x** | UI runtime | Server Components GA, `useEffectEvent`, `<Activity>`, View Transitions, React Compiler 1.0 (enabled by default in Next 16). Confidence: HIGH. |
| **TypeScript** | **5.7+** (strict) | Type safety end-to-end | Mandatory for Drizzle schema-as-code, Zod inference, and Anthropic SDK typings. Confidence: HIGH. |
| **Neon** (serverless Postgres) | API/driver `@neondatabase/serverless` 1.x | Managed Postgres database | Scale-to-zero on **all plans** (incl. paid) is the killer feature for a single-user app idle 23 h/day. Vercel's "Vercel Postgres" is now a thin wrapper around Neon Free. 100 compute-hours/month + 0.5 GB free is more than enough. Database branching is helpful for schema migrations. Confidence: HIGH. |
| **Drizzle ORM** | **0.45.x** (orm) + **drizzle-kit 0.31.x** | Type-safe SQL + migrations | ~7 KB minified runtime, no engine binary, ~500 ms cold start (vs 1–3 s with Prisma in our experience). Schema-as-TypeScript is pleasant for someone who reads SQL. Native `drizzle-orm/neon-http` driver. Migrations via `drizzle-kit generate` + `drizzle-kit migrate`. Confidence: HIGH. |
| **Tailwind CSS** | **4.2.x** | Styling | v4 has CSS-first config, Lightning CSS engine, faster builds; standard for Next.js + shadcn/ui in 2026. Confidence: HIGH. |
| **shadcn/ui** | latest CLI (registry-based, no version pin) | Copy-in component library | Owns its components (no vendor lockin), built on Radix primitives, Tailwind v4 compatible, financial-dashboard templates abound (e.g. `next-shadcn-dashboard-starter`). Owner-of-code model fits "single dev, single user" perfectly. Confidence: HIGH. |
| **Better Auth** | **1.6.x** | Authentication (single owner, credentials) | Auth.js (NextAuth) v5 is now maintained by the Better Auth team and the official migration path points to Better Auth. Stores sessions in your own Postgres (no third-party SaaS for sensitive financial data), Drizzle adapter exists, supports email+password, passkeys, 2FA out of the box. Strong fit for "lightest setup that's still secure for sensitive data." Confidence: MEDIUM-HIGH (library is young but active and is the new default in the Next.js auth ecosystem). |
| **Anthropic TypeScript SDK** | **`@anthropic-ai/sdk` 0.92.x** | Claude API client | Official SDK. Used directly (avoid Vercel AI SDK abstractions for the advisor — we want explicit prompt-cache control). Confidence: HIGH. |
| **Claude Sonnet 4.6** | model id `claude-sonnet-4-6` | AI financial advisor (default model) | $3 / $15 per MTok in/out. For 50–500 monthly transactions in Spanish, Sonnet 4.6 is the sweet spot: handles nuanced Spanish reasoning ("estás gastando un 18 % más en restaurantes que el trimestre pasado"), supports prompt caching (5 m default, 1 h optional), 1 M context. Haiku 4.5 is too shallow for 3–5 *personalized, concrete* recommendations; Opus 4.7 is overkill at 5× the cost for one user. Confidence: HIGH. See LLM section below. |
| **Inngest** | **3.x** (server SDK) — published as `inngest` 3.x | Durable scheduled jobs (nightly bank sync, monthly advisor run, PSD2 re-consent reminders) | 50,000 runs/month free; serverless-native (runs on Vercel Functions, no separate worker); step functions survive failures and can sleep across days (perfect for the 90-day PSD2 re-consent flow); typed events; replayable. **Vercel Cron does not retry**, which is unacceptable for "the bank sync failed at 03:14 silently and the user opens the dashboard at 09:00." Confidence: HIGH. |
| **Recharts** | **3.8.x** | Charts (cash-flow lines, category bars, monthly comparisons) | The default React chart library in 2026 (~2.4 M weekly downloads). Composable, declarative, SVG-based — fine performance at the volumes we'll have (≤ a few thousand SVG nodes per dashboard, at most). Pairs natively with **shadcn/ui Charts** (which wraps Recharts), keeping styling consistent with the rest of the UI. Confidence: HIGH. |
| **Zod** | **4.4.x** | Runtime validation (forms, env, PSD2 webhook payloads, LLM response shapes) | v4 brings standalone schemas, faster runtime (~equal to Valibot), better DX. Drizzle has a `drizzle-zod` companion that derives Zod schemas from your DB schema. Massive ecosystem. Bundle-size disadvantage vs Valibot is irrelevant on a server-rendered dashboard. Confidence: HIGH. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-zod` | matches drizzle-orm | Auto-generate Zod schemas from Drizzle tables | Form validation aligned with DB columns; avoids drift. |
| `@neondatabase/serverless` | **1.x** | HTTP/WS Postgres driver for serverless | Plug into `drizzle-orm/neon-http`. Avoids long-lived TCP connections (Vercel Functions). |
| **Inngest** | 3.x | See above | One package covers cron + retries + step functions. |
| `nuqs` | **2.8.x** | Type-safe URL search-params state | For dashboard filters (month, category) — keeps state shareable & RSC-compatible. |
| `next-intl` (lightweight) or just **native `Intl.NumberFormat` / `Intl.DateTimeFormat`** with `'es-ES'` | n/a | EUR & Spanish date formatting | Project is Spanish-only — prefer raw `Intl` over a full i18n framework. `new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })` gives `1.234,56 €`. |
| `date-fns` + `date-fns/locale/es` | **4.1.x** | Date math (period boundaries, "last 6 months", relative dates in Spanish) | Lightweight, tree-shakeable. Formatting uses `format(date, 'd MMMM yyyy', { locale: es })`. Avoid Luxon for this project — Intl-based formatting alone covers the display side. |
| `@anthropic-ai/sdk` | 0.92.x | LLM client (already core, listed for completeness) | Use raw SDK; do **not** wrap in Vercel AI SDK for the advisor (need explicit `cache_control` placements). The AI SDK is fine for any future streaming chat UI. |
| **Tremor** components (optional) | 3.x | Pre-styled KPI cards & sparklines on top of Recharts | Add only if you want shadcn-look financial KPI tiles fast — otherwise build them with shadcn `Card` + Recharts. Don't pull both Tremor primitives and shadcn unless needed. |
| `lucide-react` | latest | Icons (used by shadcn/ui) | Default. |
| `sonner` | latest | Toasts | shadcn-recommended toast library. |
| `@tanstack/react-query` | **5.100.x** | Client-side cache (only if needed) | Most data is server-fetched in RSC — only add when you build genuinely interactive client widgets (e.g. live category override). Otherwise *omit*. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest** | Unit + integration tests | **4.1.x**. Native ESM, ~20× faster than Jest on Vite/Next. Use `@vitejs/plugin-react`. |
| **@playwright/test** | E2E (PSD2 redirect flow, advisor end-to-end, dashboard rendering) | **1.59.x**. Required because async Server Components are not reliably testable in Vitest. Shard in CI. |
| **drizzle-kit** | Migrations (`generate`, `migrate`, `studio`) | Same version as `drizzle-orm`. |
| **ESLint 9 (flat config) + `@typescript-eslint`** | Lint | Use the Next.js + Tailwind plugins. |
| **Prettier 3** + `prettier-plugin-tailwindcss` | Formatting | Sorts Tailwind classes deterministically. |
| **Biome** *(optional)* | All-in-one lint+format | Faster than ESLint+Prettier; some shadcn templates use it. Pick *one* of (Biome) **or** (ESLint + Prettier), not both. |
| **TSX** (`tsx`) | Run TS scripts (e.g. seed, ad-hoc PSD2 tests) | `npx tsx scripts/seed.ts`. |
| **Vercel CLI** | Local-prod parity, env, logs | `vercel env pull` → `.env.local`. |
## Installation
# Core (Next.js + React 19)
# Database + ORM
# Auth
# Validation
# LLM
# Charts (pick one path)
# (optional) npm install @tremor/react # adds prebuilt KPI cards on top of recharts
# Background jobs
# Misc UI/UX
# shadcn/ui (CLI initializes registry components)
# Dev / testing
## PSD2 / Open Banking — IMPORTANT, READ CAREFULLY
### Verified state (2026-05-01)
| Aggregator | Spanish bank coverage relevant to this project | Free tier for individual dev | Status for **new** signups | Confidence |
|---|---|---|---|---|
| **GoCardless Bank Account Data** (formerly Nordigen) | ING (Spain), N26, Revolut, **CaixaBank, imagin** all confirmed by historical Nordigen coverage docs | Yes — 50 banks/month, 4 syncs/account/day | **Disabled.** Page `bankaccountdata.gocardless.com/new-signups-disabled` confirms it. Existing accounts continue to work. | HIGH on availability; HIGH on coverage |
| **Enable Banking** | All major Spanish ASPSPs (CaixaBank, BBVA, Santander, Sabadell, Bankinter, Kutxabank, Unicaja); ING/N26/Revolut covered EU-wide | **Free for personal use** ("retrieve your own transactions and balances") | Open. Self-service developer signup. | MEDIUM (free-personal claim verified via 3rd-party sources; needs final confirmation on Enable Banking website before commit) |
| **Tink** (Visa-owned) | 510+ EU institutions including ING, N26, Revolut, CaixaBank | No public free tier; sales-led pricing | Open, but enterprise-targeted | MEDIUM (no public personal-developer pricing) |
| **TrueLayer** | 69+ Spanish/EU institutions including CaixaBank, ING (NV Spanish branch), N26, Revolut | "Free to get started" but production volume is paid | Open. Has Spain-launch announcement and CaixaBank-specific docs. | MEDIUM |
| **Plaid (EU)** | Some Spanish coverage but historically weakest in Iberia among EU aggregators | Sandbox free; production paid | Open. | LOW–MEDIUM (poor Spain fit) |
### Recommendation (decision tree)
### Architectural implication for the roadmap
### PSD2-specific UX flags for the roadmap
- **90-day re-consent**: Schedule a job (Inngest) at day 75 of each consent that emails-or-banners the user "tu consentimiento bancario expira en 15 días." Without this, the dashboard silently goes stale.
- **Callback URLs**: Vercel preview deployments give per-PR URLs that **will not match** the registered redirect URI. Register only the production domain with the aggregator, and run all PSD2 flows against the production deployment (not previews).
- **Sandbox vs production**: Every aggregator has sandbox banks (e.g. Nordigen "SANDBOXFINANCE_SFIN0000"). Use the sandbox for E2E tests in CI; never hit real banks from CI.
## LLM / AI Advisor — Specifics
### Model recommendation: **Claude Sonnet 4.6** (`claude-sonnet-4-6`)
- **Spanish reasoning quality**: Sonnet 4.6 is the cheapest tier that produces qualitatively useful, *concrete* Spanish recommendations referencing specific transactions and amounts (the project's core differentiator vs "spend less" generic advice). Haiku 4.5 tends to produce shallower advice on financial reasoning tasks; field reports note it summarizes well but reasons less rigorously.
- **Cost at this scale**: Monthly run, ~50–500 transactions ≈ ~5–10 KB of context (~2–3 K tokens), system prompt ~2–4 K tokens. Per-month cost without caching ≈ **< €0.05**. With prompt caching of the system prompt + categorization rule corpus (cache hits at 0.1× = $0.30/MTok), cost drops further.
- **Context window**: 1 M tokens — never a constraint.
| Model | Input ($/MTok) | Output ($/MTok) | Cache write 5m | Cache read |
|---|---|---|---|---|
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1.00 | $5.00 | $1.25 | $0.10 |
| **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | **$3.00** | **$15.00** | **$3.75** | **$0.30** |
| Claude Opus 4.7 (`claude-opus-4-7`) | $5.00 | $25.00 | $6.25 | $0.50 |
- `categorize-merchant` job → **Haiku 4.5** (called maybe 5–50 times per sync per new merchant)
- `monthly-advisor` job → **Sonnet 4.6** (called once per month)
### Do **NOT** use Vercel AI SDK as the primary path for the advisor
## Auth — Single owner, credentials, sensitive data
### Recommended: **Better Auth** (1.6.x)
- Sessions in **your own Postgres** (Drizzle adapter) — bank/transaction data is sensitive enough that introducing a third-party SaaS like Clerk for *just* one user is a poor risk/cost trade. Clerk's free tier covers this, but adds a remote trust boundary that has no upside for a personal app.
- Code-first config, no API-route boilerplate, instant session revocation (important for a credentials-only single-user app where "log out everywhere" matters).
- Auth.js v5 is now maintained by the Better Auth team and the official migration path leads to Better Auth — picking Better Auth aligns with where the ecosystem is consolidating in 2026.
- **Configuration**: email + password (or username + password); add **passkeys** in v1.1 with one config flag; consider TOTP 2FA before connecting the first real bank account.
### What NOT to do for auth
- **Do not** roll your own session cookies / hashed-password flow "because it's just one user." The attack surface (session fixation, timing attacks on password compare, missing CSRF) is genuinely larger than installing Better Auth.
- **Do not** use Auth.js / NextAuth v5 *for new* projects — viable but in maintenance/migration mode.
- **Do not** use **Lucia** — deprecated March 2025, transformed into educational resources.
- **Do not** use Supabase Auth unless you are also using Supabase as your DB (we're using Neon).
## UI / Spanish-locale formatting
- **Currency**: `new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(1234.56)` → `1.234,56 €`. Never hand-roll this.
- **Dates**: `new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(d)` → `1 de mayo de 2026`. For relative ("hace 2 días") use `date-fns` `formatDistance` with `locale: es`.
- **Decimal commas in inputs**: shadcn/ui `<Input type="number">` uses the browser locale automatically (Spanish keyboards type comma → browser converts). Validate with Zod's `z.coerce.number()` and a `.refine()` that strips thousand-separators from string inputs as a fallback.
## Background jobs / scheduling
### Recommended: **Inngest** (3.x)
- **50,000 runs/month free** — overwhelmingly more than this project will use (~30 nightly syncs × ~4 banks + 1 monthly advisor + ad-hoc retries ≈ 150 runs/month).
- **Step functions** survive Function timeouts and can `step.sleep("until-day-75")` — exactly what you want for the 90-day re-consent reminder, expressed as one Inngest function rather than glue code over a `consent_expires_at` column.
- **Automatic retries with exponential backoff** — Vercel Cron has zero retries; this is a hard gap.
- **Local dev story is good**: `npx inngest-cli dev` runs an in-process scheduler so you can test "what happens at 03:00" without waiting.
### Alternatives
- **Vercel Cron** alone — *only* viable if you accept silent failure on bank-sync nights. Use cron only for low-stakes work (e.g. a "wake up the dashboard" warmup).
- **QStash** (Upstash) — fine, simpler primitive (HTTP message queue with retries). Use if Inngest's step-function model feels heavy. Pricing: 500 msg/day free.
- **Trigger.dev** — overkill for this project; targets longer-running jobs that exceed Vercel's function timeout. Not needed when each PSD2 sync is < 30 s.
## Validation
### Recommended: **Zod 4.4.x**
## Testing
- **Vitest 4.1.x**: unit + integration. Test pure functions (categorization rules, EUR rounding, date helpers, Zod schemas) and synchronous Server/Client components with React Testing Library.
- **Playwright 1.59.x**: E2E. Test (a) PSD2 redirect handshake against the aggregator's sandbox, (b) "manual transaction add → categorize → appears on dashboard," (c) advisor-page renders Spanish recommendations from a recorded fixture (mock the Anthropic API).
- **DO NOT** use Jest. Vitest is the 2026 default for Vite/Next, supports ESM-first cleanly, and the migration is mostly drop-in.
- **Async Server Components are not supported by Vitest** as of 2026 — test those via Playwright only. This is a documented limitation in the official Next.js testing guide.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Next.js 16 | **SvelteKit 2.x** | If the developer prefers Svelte and accepts a smaller charting/auth/PSD2-example ecosystem. SvelteKit ships ~15 KB vs Next.js's ~80 KB baseline JS — irrelevant for a behind-login dashboard. Skip. |
| Next.js 16 | **Remix / React Router v7** | If you specifically want web-fundamentals-first form `action`s without RSC. Smaller community, less Vercel synergy. Skip. |
| Next.js 16 | **Astro** | Bad fit — Astro is for content sites, not stateful dashboards with auth + DB writes. Skip. |
| Neon | **Supabase** | If you'd use Supabase Auth + Storage + Realtime. We're using Better Auth + Drizzle and don't need realtime → Neon's scale-to-zero wins. |
| Neon | **Vercel Postgres** | Vercel Postgres *is* Neon (white-labeled). Pick the Neon dashboard directly for branching UX. |
| Drizzle | **Prisma 7** | If you strongly prefer a declarative `.prisma` schema file over schema-as-TS. Prisma 7 (late 2025) finally dropped the Rust engine and works on edge — much better than v6 and earlier. Still ~200× larger bundle than Drizzle. |
| Drizzle | **Kysely** | Pure query builder, great if you reject ORMs entirely. Adds friction (no migration tool of equivalent maturity to drizzle-kit). |
| Better Auth | **Clerk** | Choose if you want pre-built UI components and OAuth providers configured in 5 minutes. The free tier (10 K MAU) trivially covers a single user, but adds a third-party trust boundary for sensitive data — questionable for this project. |
| Better Auth | **Auth.js v5 (NextAuth)** | Only if migrating an existing NextAuth codebase. Greenfield → Better Auth. |
| Sonnet 4.6 | **Haiku 4.5** | Use for the high-volume *categorize-one-merchant* fallback — not for the monthly advisor. |
| Sonnet 4.6 | **Opus 4.7** | If you ever do quarterly/annual deep-analysis reports where reasoning depth matters more than cost (5× the price of Sonnet). |
| Recharts | **Tremor** | Add on top of Recharts when you want shadcn-style KPI tiles + sparklines without writing them. |
| Recharts | **ECharts (echarts-for-react)** | Only if you outgrow Recharts performance — ~100K+ data points, candlesticks, treemaps. Not v1 for this project. |
| Recharts | **Visx** | If you need bespoke chart compositions (financial-grade interactions). High customization cost. Skip. |
| Recharts | **Chart.js (react-chartjs-2)** | Canvas-based, faster on huge datasets, but worse declarative DX. Not preferred when Recharts handles your volumes. |
| Inngest | **Vercel Cron + Upstash QStash** | Lighter footprint; fine if you'd rather hand-roll the retry queue. |
| Inngest | **Trigger.dev** | If sync jobs grow past 30 s consistently; not v1. |
| Zod 4 | **Valibot** | Pick only if client-bundle size is the top constraint. |
| Vitest | **Jest** | Avoid for new projects in 2026 — Vitest is faster and ESM-first. |
## What NOT to Use
| Avoid | Why | Use Instead |
|---|---|---|
| **Lucia Auth** | Deprecated March 2025, repo turned into educational resources | Better Auth |
| **Vercel KV / Vercel Postgres "as a separate product"** | Now thin Neon/Upstash wrappers; using the underlying providers directly gives you better dashboards and pricing | Neon directly; Upstash directly |
| **Direct bank scraping / saving user passwords** | Illegal in EU under PSD2; will break; banks will block you | A regulated AISP aggregator (GoCardless / Enable Banking) |
| **Storing PSD2 access tokens client-side / in cookies** | Token theft = full bank account read access | Server-only env vars + DB rows encrypted at rest |
| **Client-side LLM calls to the Anthropic API** | Leaks the API key | Server Actions / Route Handlers only |
| **Plaid for Spain** | Iberian coverage historically weak; expensive for personal scale | GoCardless or Enable Banking |
| **Moment.js** | Deprecated, large bundle | `date-fns` + native `Intl` |
| **Floating-point arithmetic on cents (`amount: number`)** | Rounding bugs in EUR sums (`0.1 + 0.2 !== 0.3`) | Store amounts as **integer cents** (`amount_cents: integer`) in Postgres, format with `Intl.NumberFormat`. *(See PITFALLS.md.)* |
| **Storing transaction descriptions as PII in logs** | GDPR + sensitive | Redact before logging; never include raw `concept`, `iban`, or `merchant` in observability |
| **CSS-in-JS (styled-components, emotion)** | RSC-incompatible without workarounds; bundle cost | Tailwind v4 (and shadcn primitives) |
| **Pages Router** | Legacy; new features land in App Router only | App Router from day 1 |
| **Long-running Node workers** | Vercel doesn't run them | Inngest step functions / scheduled functions |
| **Auth.js Credentials provider in v5 with database sessions** | Auth.js v5 limits Credentials to JWT-only sessions, awkward for revocation | Better Auth (handles credentials + DB sessions cleanly) |
| **Unencrypted bank tokens at rest** | Compliance + leak risk | `pgcrypto` or app-level AES-GCM with a key in Vercel encrypted env (out of scope here, **flagged for ARCHITECTURE.md**) |
## Stack Patterns by Variant
- Use GoCardless as primary aggregator. Enable Banking remains a fallback adapter behind the same `BankSyncProvider` interface.
- Free tier (50 banks/month, 4 syncs/day/account) is plenty for one user.
- Plan for slightly heavier auth/session glue (the app stores its own session per ASPSP).
- Allocate +1 day in the bank-sync phase for ASPSP-specific quirks (CaixaBank vs ING redirect details).
- Then add **Vercel AI SDK** (`ai` package) for streaming UI. Keep the monthly batch advisor on the raw Anthropic SDK.
- Move *categorization fallback* calls to Anthropic **Batch API** (50% off). The monthly advisor is one call/month — not worth batching.
## Version Compatibility
| Package A | Compatible With | Notes |
|---|---|---|
| `next@16.2.x` | `react@19.2.x`, `react-dom@19.2.x` | Next 16 requires React 19. |
| `next@16.2.x` | `tailwindcss@4.x` | Tailwind v4 + Next 16 is the supported pairing; v3 still works but is the legacy path. |
| `drizzle-orm@0.45.x` | `@neondatabase/serverless@1.x` | Use `drizzle-orm/neon-http` driver. |
| `drizzle-orm@0.45.x` | `drizzle-kit@0.31.x` | Keep these versions in lockstep — drizzle-kit version mismatch causes silent migration drift. |
| `better-auth@1.6.x` | `drizzle-orm@0.45.x` | Use `better-auth/adapters/drizzle`. |
| `@anthropic-ai/sdk@0.92.x` | Node 20+ | Vercel default is Node 20; ensure `engines.node ">=20"` in `package.json`. |
| `vitest@4.1.x` | `@vitejs/plugin-react@5.x` | React 19 tests. |
| `@playwright/test@1.59.x` | Node 20+ | Run `npx playwright install --with-deps` once. |
| `recharts@3.8.x` | `react@19.2.x` | v3 is React-19-ready. |
| `zod@4.4.x` | `drizzle-zod` (latest) | `drizzle-zod` follows Zod 4. |
| `inngest@3.x` | Next 16 (App Router Route Handler) | Mount at `app/api/inngest/route.ts`. |
## Confidence Assessment per Recommendation
| Choice | Confidence | Why |
|---|---|---|
| Next.js 16 + RSC + Server Actions | HIGH | Default on Vercel; verified versions |
| Neon + Drizzle | HIGH | Verified npm versions; serverless-native |
| Better Auth | MEDIUM-HIGH | Library is young (v1.x); ecosystem alignment is strong |
| Anthropic Sonnet 4.6 default | HIGH | Pricing + caching rules verified against `platform.claude.com/docs` |
| **PSD2 aggregator (GoCardless → Enable Banking fallback)** | **MEDIUM-LOW** | GoCardless new-signup status verified disabled; Enable Banking free-personal claim needs final user-side confirmation |
| Inngest | HIGH | Verified free-tier limits; standard for Next + Vercel |
| Recharts | HIGH | Default React chart lib in 2026 |
| Tailwind v4 + shadcn/ui | HIGH | Current standard pairing |
| Zod 4 | HIGH | v4 perf-parity with Valibot, ecosystem dominant |
| Vitest + Playwright | HIGH | Recommended by Next.js docs |
## Sources
- Next.js 16 release blog — https://nextjs.org/blog/next-16 — verified release date Oct 21 2025, App Router stable, Turbopack default
- Next.js 16 upgrade guide — https://nextjs.org/docs/app/guides/upgrading/version-16
- Next.js testing guide (Vitest) — https://nextjs.org/docs/app/guides/testing/vitest — confirms async Server Components tested via Playwright
- npm registry (live) — `npm view <pkg> version` confirmed: `next@16.2.4`, `react@19.2.5`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@anthropic-ai/sdk@0.92.0`, `zod@4.4.1`, `better-auth@1.6.9`, `tailwindcss@4.2.4`, `recharts@3.8.1`, `vitest@4.1.5`, `@playwright/test@1.59.1`, `valibot@1.3.1`, `date-fns@4.1.0`, `nuqs@2.8.9`, `inngest@3.x`, `@upstash/qstash@2.10.1` (May 2026)
- Anthropic prompt-caching docs — https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching — confirms TTLs (5 m default, 1 h ×2 write), cache write/read multipliers (1.25× / 0.1×), minimum cacheable: Sonnet 4.6 = 2,048 tokens, Haiku 4.5 / Opus 4.7 = 4,096 tokens
- Anthropic pricing — https://platform.claude.com/docs/en/about-claude/pricing — verified Haiku 4.5 ($1/$5), Sonnet 4.6 ($3/$15), Opus 4.7 ($5/$25) per MTok, May 2026
- Claude API pricing 2026 (cross-check) — https://benchlm.ai/blog/posts/claude-api-pricing — confirms April 2026 Opus 4.7 release at same headline price as 4.6
- GoCardless Bank Account Data — signups disabled — https://bankaccountdata.gocardless.com/new-signups-disabled — verified May 2026 still disabled
- GoCardless Bank Account Data docs — https://developer.gocardless.com/bank-account-data/overview — verified free-tier (50 banks/month, 4 syncs/account/day) for *existing* customers
- Enable Banking docs — https://enablebanking.com/docs/markets/es/ — confirms major Spanish ASPSP coverage (CaixaBank, BBVA, Santander, Sabadell, Bankinter, Kutxabank, Unicaja)
- Enable Banking FAQ — https://enablebanking.com/docs/faq/ — pricing volume-based; sandbox available; final personal-tier confirmation pending direct check
- TrueLayer supported providers — https://docs.truelayer.com/docs/supported-providers-table and Spain launch blog https://truelayer.com/blog/announcements/spain-launch/ — confirms Spain (CaixaBank, ING NV Spanish branch, BBVA, Santander)
- Tink supported banks — https://www.openbankingtracker.com/api-aggregators/tink — 510+ EU institutions
- Open Banking Tracker (cross-vendor coverage) — https://www.openbankingtracker.com/ — verified ING/N26/Revolut/CaixaBank presence across aggregators
- Better Auth comparison & migration — https://better-auth.com/docs/comparison and https://authjs.dev/getting-started/migrate-to-better-auth — confirms Auth.js now maintained by Better Auth team
- Lucia deprecation — confirmed March 2025 (LogRocket survey, Lucia repo)
- Drizzle ORM serverless docs — https://orm.drizzle.team/docs/perf-serverless — confirms ~7 KB runtime, neon-http driver, Vercel/Neon support
- Neon pricing & free tier — verified 100 compute-hours/month, 0.5 GB storage, scale-to-zero on all plans
- Vercel Cron pricing/limits — https://vercel.com/docs/cron-jobs/usage-and-pricing — confirms no automatic retries; Hobby = once/day max
- Inngest free tier — verified 50K runs/month free, step functions, retries
- Recharts comparison (cross-source) — https://www.pkgpulse.com/blog/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026 and embeddable.com 2026 review
- Zod v4 vs Valibot — https://www.pkgpulse.com/guides/valibot-vs-zod-v4-typescript-validator-2026 — perf parity, ecosystem dominance
- Vitest + Playwright Next.js — https://nextjs.org/docs/app/guides/testing/playwright
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
