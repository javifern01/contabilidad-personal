---
phase: 02-manual-tracker-mvp
plan: 01
subsystem: database-schema
tags: [drizzle, neon, migration, seed, schema, foundation]
dependency_graph:
  requires:
    - drizzle/schema.ts (Phase 1 — extended in place)
    - drizzle/migrations/0000_phase1_auth_and_audit.sql (predecessor migration)
    - scripts/migrate.ts (Phase 1 runner — extended)
    - scripts/create-owner.ts (idempotent-script template)
    - lib/db.ts (Drizzle/Neon singleton)
  provides:
    - drizzle/schema.ts (accounts, categories, transactions tables + 6 type exports)
    - drizzle/migrations/0001_phase2_transactions.sql (DDL applied to live Neon EU)
    - scripts/seed-categories.ts (exports seedCategoriesAndAccounts)
    - Live Neon EU rows: 14 system categories, 1 Efectivo account
  affects:
    - All Phase 2 plans 02-02 .. 02-09 (Server Actions, list, dashboard, aggregates)
    - Phase 3 (CAT-*): will ALTER categories to add parent_id/icon/color
    - Phase 4 (SYNC-*): will ALTER accounts to add PSD2 columns
    - Phase 6 (ADV-*): consumes the same aggregate primitives
tech_stack:
  added: []
  patterns:
    - Drizzle pgTable + (t) => [...] index/check callback (extends Phase 1 authAuditLog pattern)
    - Self-FK via raw SQL hand-patch in migration tail (mirrors Phase 1 INET hand-patch pattern)
    - Idempotent seed script with count() guard + onConflictDoNothing (mirrors create-owner.ts)
    - Migration runner invokes seed after migrate() resolves (single Vercel-build entry point per D-09)
key_files:
  created:
    - path: scripts/seed-categories.ts
      purpose: Idempotent seed for 14 system categories + 1 Efectivo cash account
    - path: drizzle/migrations/0001_phase2_transactions.sql
      purpose: DDL for accounts/categories/transactions + indexes + CHECK constraints + self-FK
    - path: drizzle/migrations/meta/0001_snapshot.json
      purpose: Drizzle snapshot of post-Phase-2 schema state (auto-generated)
  modified:
    - path: drizzle/schema.ts
      purpose: Added accounts/categories/transactions tables + 6 type exports
    - path: drizzle/migrations/meta/_journal.json
      purpose: Updated migration tag to 0001_phase2_transactions after rename
    - path: scripts/migrate.ts
      purpose: Imports and invokes seedCategoriesAndAccounts() after migrate() resolves
decisions:
  - Self-FK on transactions.transfer_pair_id added via raw SQL ALTER in migration tail
  - currency column on accounts is text in TS; D-18 char(3) tightening deferred to Phase 4 ALTER
  - categories.kind enum enforced via SQL CHECK constraint inside (t) => [...] callback; pgEnum NOT used
  - Migration runner extension chosen over separate npm run seed step (CONTEXT D-17 planner picks)
  - Renamed Drizzle auto-slug to 0001_phase2_transactions.sql; updated meta/_journal.json tag accordingly
metrics:
  duration: ~25 min wall-clock
  tasks_completed: 4
  files_changed: 6
  completed_date: 2026-05-02
requirements: [MAN-01, MAN-04, MAN-05, DASH-06]
---

# Phase 2 Plan 01: Schema, Migration, Seed Summary

**One-liner:** Locked the Phase 2 data model — accounts/categories/transactions tables in Drizzle, generated 0001 migration with hand-patched self-FK on transfer_pair_id, applied to live Neon EU, and idempotently seeded 14 Spanish system categories + 1 Efectivo cash account.

## Outcome

This plan is the schema push that every downstream Phase 2 plan depends on.

After completion:

- drizzle/schema.ts declares 3 new pgTable definitions (accounts, categories, transactions) plus 6 new TypeScript type exports (Account, NewAccount, Category, NewCategory, Transaction, NewTransaction).
- drizzle/migrations/0001_phase2_transactions.sql applied successfully to live Neon EU (region eu-central-1).
- Live DB row counts verified: categories=14, accounts=1, transactions=0.
- Idempotency proven: a second run of npm run db:migrate is a no-op for the seed (output: 14 categories already exist; skipping seed. and 1 accounts already exist; skipping seed.).
- Phase 1 tables untouched: user, session, account, verification, authAuditLog all intact; lint/typecheck/db:check all pass.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Extend drizzle/schema.ts with accounts/categories/transactions + 6 type exports | dcf0266 |
| 2 | Generate Phase 2 SQL migration via drizzle-kit, hand-patch self-FK, db:check | 808b197 |
| 3 | Create scripts/seed-categories.ts (14 categories + 1 Efectivo account, idempotent) | 123a78e |
| 4 | Wire seedCategoriesAndAccounts into scripts/migrate.ts and run BLOCKING migration on live Neon EU | b822404 |

## Live DB Schema — Indexes Applied

Confirmed via pg_indexes query against live Neon EU.

| Index | Table | Type | Filter |
|-------|-------|------|--------|
| accounts_pkey | accounts | PK btree | — |
| categories_pkey | categories | PK btree | — |
| transactions_pkey | transactions | PK btree | — |
| transactions_account_dedup_unique_idx | transactions | UNIQUE btree on (account_id, dedup_key) | — |
| transactions_booking_date_partial_idx | transactions | btree on (booking_date DESC NULLS LAST) | WHERE soft_deleted_at IS NULL |
| transactions_account_booking_partial_idx | transactions | btree on (account_id, booking_date DESC NULLS LAST) | WHERE soft_deleted_at IS NULL |
| transactions_category_booking_partial_idx | transactions | btree on (category_id, booking_date DESC NULLS LAST) | WHERE soft_deleted_at IS NULL |

## Live DB Schema — CHECK Constraints

| Constraint | Definition |
|------------|------------|
| categories_kind_check | CHECK on kind IN expense/income/transfer |
| transactions_amount_cents_positive_check | CHECK amount_cents greater than 0 (D-21 enforcement) |
| transactions_amount_eur_cents_positive_check | CHECK amount_eur_cents greater than 0 (D-21 enforcement) |

## Live DB Schema — Foreign Keys

| Constraint | Definition |
|------------|------------|
| transactions_account_id_accounts_id_fk | FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT |
| transactions_category_id_categories_id_fk | FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT |
| transactions_transfer_pair_id_fkey | FOREIGN KEY (transfer_pair_id) REFERENCES transactions(id) ON DELETE SET NULL (hand-patched in migration tail) |

## Live DB Verification — One-liner Output

Run via direct neon driver against live Neon EU (postgresql://neondb_owner:***@ep-muddy-wave-aluwr21u-pooler.c-3.eu-central-1.aws.neon.tech/neondb):

categories=14, accounts=1, transactions=0

## migrate.ts Wiring Path Chosen

CONTEXT D-17 left the planner two options: (a) extend scripts/migrate.ts to call seedCategoriesAndAccounts() after migrate() resolves, or (b) add a separate npm run seed:categories script.

Chosen: (a) extend scripts/migrate.ts. This keeps Vercel build single bootstrap entry point per Phase 1 D-09 (tsx scripts/migrate.ts and then next build) and means every deploy lands a fresh, seeded DB without orchestration glue. Idempotency guards make this safe on re-runs.

## Idempotency Proof (live DB, second consecutive run)

Output from the second `npm run db:migrate` invocation:

- Applying migrations against postgresql://neondb_owner:***@ep-muddy-wave-aluwr21u-pooler.c-3.eu-central-1.aws.neon.tech/neondb...
- Done in 373ms
- 14 categories already exist; skipping seed.
- 1 accounts already exist; skipping seed.
- Seed complete.

## Verification Gates (end-of-plan)

| Gate | Result |
|------|--------|
| npm run lint | exits 0 (no warnings) |
| npm run typecheck | exits 0 (strict mode) |
| npm run db:check | Everything is fine (no schema/migration drift) |
| npm run db:migrate (1st run) | migration applied, 14 + 1 rows seeded |
| npm run db:migrate (2nd run) | idempotent no-op for the seed |
| Live DB row counts | categories=14, accounts=1, transactions=0 |
| Phase 1 unit tests (lib/format, lib/crypto, lib/logger) | 79 passed (3 test files) |

## Deviations from Plan

The four core tasks executed as written. The only minor judgement call within the plan scope was an inline Rule 3 (Tooling) adjustment to the Drizzle-generated migration:

1. Rule 3 - Tooling: Renamed Drizzle auto-slugged migration filename
   - Found during: Task 2
   - Issue: drizzle-kit generate emitted 0001_polite_nehzno.sql (random slug); plan and Phase 1 convention require 0001_phase2_transactions.sql.
   - Fix: Renamed the file via mv and updated drizzle/migrations/meta/_journal.json tag from 0001_polite_nehzno to 0001_phase2_transactions so Drizzle journal still resolves the file.
   - Files modified: drizzle/migrations/0001_phase2_transactions.sql, drizzle/migrations/meta/_journal.json
   - Commit: 808b197

## Out-of-Scope Issues Discovered (NOT FIXED)

- lib/auth-rate-limit.test.ts integration tests fail when DATABASE_URL is set to a fake/unreachable URL such as postgresql://test:test@localhost/test. The test uses describe.skipIf to skip when no DB is available, but a fake/unreachable URL passes the skip check and then errors at runtime with ECONNREFUSED. This is a pre-existing Phase 1 test-env brittleness, NOT a regression introduced by Phase 2. Filed for tracking but not fixed (out of scope per executor scope-boundary rule). Phase 1 unit tests (lib/format.test.ts, lib/crypto.test.ts, lib/logger.test.ts) all pass: 79 of 79.

## Threat Model Review (per plan threat_model)

| Threat ID | Disposition | Mitigation Applied |
|-----------|-------------|--------------------|
| T-02-01 (Tampering, amount_cents) | mitigate | DB-level CHECK amount_cents and amount_eur_cents > 0 confirmed live; Zod input validation will be added in Plan 03 Server Actions |
| T-02-02 (Information Disclosure, seed logs) | mitigate | seed uses process.stderr.write only; ESLint no-console rule confirmed via lint pass; no DATABASE_URL leaked in stderr (migrate.ts already redacts via maskUrl) |
| T-02-03 (DoS, non-idempotent re-run) | mitigate | count() guards + onConflictDoNothing; live DB confirmed idempotent on 2nd run |
| T-02-04 (FK cascade) | accept | transactions.account_id and transactions.category_id use ON DELETE RESTRICT; Phase 7 PRIV-02 will revisit account-deletion cascade semantics |

No new threats discovered during execution.

## Phase 2 Schema Fitness for Downstream Plans

- Plan 02-02 (Server Actions for transactions): can import transactions, categories, accounts and the NewTransaction type to validate Zod-derived inputs against actual columns. dedup_key UNIQUE constraint will surface the dedup-collision error path.
- Plan 02-03+ (lib/aggregates.ts): the 3 partial btree indexes power WHERE soft_deleted_at IS NULL AND ... queries efficiently.
- Plan 02-04+ (transactions list, dashboard): the transactions_account_booking_partial_idx and transactions_category_booking_partial_idx cover the common filter combinations (mes / cat) per D-28.
- Phase 4 (PSD2 sync): existing schema already has external_id, merchant_normalized, source, original_currency, fx_rate, amount_eur_cents columns ready; only ALTERs to accounts are needed.

## Self-Check: PASSED

- drizzle/schema.ts modified — git log oneline grep dcf0266 confirms commit
- drizzle/migrations/0001_phase2_transactions.sql exists — file present, contents grep-verified
- drizzle/migrations/meta/_journal.json tag updated — 0001_phase2_transactions
- drizzle/migrations/meta/0001_snapshot.json exists — Drizzle-generated, committed in 808b197
- scripts/seed-categories.ts exists — committed in 123a78e
- scripts/migrate.ts modified — committed in b822404
- All 4 commits present in git log: dcf0266, 808b197, 123a78e, b822404
- Live DB row counts match expected: categories=14, accounts=1, transactions=0
- All 3 CHECK constraints active in live DB (categories_kind_check + 2 amount_cents positivity checks)
- All 3 FK constraints active in live DB (account/category cross-FKs + self-FK on transfer_pair_id)
- All 4 transactions indexes active in live DB (1 unique compound + 3 partial)
