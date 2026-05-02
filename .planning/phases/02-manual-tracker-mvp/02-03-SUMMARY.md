---
phase: 02-manual-tracker-mvp
plan: 03
subsystem: server-actions
tags: [server-actions, transactions, dedup, cache-invalidation, zod, drizzle, pino-redact]
dependency_graph:
  requires:
    - lib/auth.ts (auth.api.getSession — Phase 1)
    - lib/db.ts (Drizzle/Neon singleton — Phase 1)
    - lib/logger.ts (Pino with description_raw on redact list — Phase 1)
    - lib/format.ts parseEurInput (Phase 1)
    - drizzle/schema.ts transactions/accounts/categories (Phase 2 Plan 01)
  provides:
    - app/(authenticated)/actions/transactions.ts (4 Server Actions + result types)
    - lib/dedup.ts (computeManualDedupKey + normalizeDescription)
  affects:
    - Plan 02-04 (lib/aggregates.ts) — wraps reads in unstable_cache with same `transactions`+`dashboard` tags
    - Plan 02-05 (QuickAddSheet form) — submits to addTransaction; pattern-matches on AddTransactionResult
    - Plan 02-06 (transaction list) — calls editTransaction / softDeleteTransaction / restoreTransaction
    - Plan 02-09 (Playwright E2E) — exercises the real-session path through HTTP
tech_stack:
  added: []
  patterns:
    - Discriminated-union Server Action result type (mirrors Phase 1 LoginActionResult)
    - SHA-256 dedup key with minute-bucket anchor (D-22)
    - Postgres SQLSTATE introspection via .cause-chain walk (DrizzleQueryError → NeonDbError)
    - vi.mock("@/lib/auth") session injection — no env-gated bypass anywhere in production code
    - Single-arg revalidateTag wrapper delegating to Next 16's updateTag (Server Action API)
key_files:
  created:
    - path: lib/dedup.ts
      purpose: Pure D-22 dedup-key + description normalization; no DB / no Next deps
    - path: lib/dedup.test.ts
      purpose: 14 Vitest unit tests (RED→GREEN); covers minute-truncation, determinism, per-field divergence
    - path: app/(authenticated)/actions/transactions.ts
      purpose: 4 Server Actions (add/edit/softDelete/restore) with D-39 cache invalidation + T-02-07 session check
    - path: app/(authenticated)/actions/transactions.test.ts
      purpose: 10 integration tests against live Neon EU; vi.mock injects session for T-02-07 mitigation
  modified: []
decisions:
  - Drizzle wraps Neon errors in DrizzleQueryError; SQLSTATE code lives on .cause (NeonDbError). Helper pgErrorCode walks the cause chain.
  - Next 16 deprecated single-arg revalidateTag at the type layer; updated to use updateTag (Server Action API) under a single-arg revalidateTag wrapper so D-39 call-site spelling remains intact.
  - editTransaction on a soft-deleted row returns kind:"not_found" (semantically distinct from server_error per D-30).
  - restoreTransaction is intentionally idempotent (no isNull guard) — re-restoring a non-deleted row succeeds.
  - softDeleteTransaction has the isNull(softDeletedAt) guard so re-deleting a deleted row returns kind:"not_found" instead of bumping updated_at.
  - account_id defaults to the seeded 'Efectivo' account when omitted from FormData (D-19; only one account exists at Phase 2).
metrics:
  duration: ~10 min wall-clock
  tasks_completed: 2
  files_changed: 4
  completed_date: 2026-05-02
requirements: [MAN-01, MAN-03, MAN-04, UX-02]
---

# Phase 2 Plan 03: Manual Transaction Server Actions Summary

**One-liner:** Implemented the four Wave-2 Server Actions (`addTransaction`, `editTransaction`, `softDeleteTransaction`, `restoreTransaction`) with D-22 SHA-256 minute-bucketed dedup, Zod validation per D-24, Postgres-error-code-aware (23505→duplicate, 23503→validation) discriminated-union results, real `auth.api.getSession` gate (no env bypass — T-02-07), and D-39 cache invalidation; full TDD RED→GREEN cycle for both `lib/dedup` (14 unit tests) and `actions/transactions` (10 integration tests against live Neon EU).

## Outcome

This plan is the write-side mediation layer that Wave 3 forms (Plan 05) and Wave 3 list/edit UI (Plan 06) submit through.

After completion:

- `lib/dedup.ts` exports `computeManualDedupKey(input)` and `normalizeDescription(s)` as pure helpers (no DB, no Next, only `node:crypto`).
- `app/(authenticated)/actions/transactions.ts` exports 4 Server Actions with discriminated-union result types (`AddTransactionResult`, `EditTransactionResult`, `SoftDeleteResult`, `RestoreResult`).
- All 4 actions verify session via `auth.api.getSession({ headers })` at entry; missing session returns `{ ok: false, kind: "server_error" }` and logs `transactions_<verb>_no_session`.
- Postgres SQLSTATE 23505 (unique violation on `(account_id, dedup_key)`) → `{ ok: false, kind: "duplicate" }` for the Spanish dedup-collision toast.
- Postgres SQLSTATE 23503 (FK violation on `category_id`) → `{ ok: false, kind: "validation", fieldErrors: { category_id: [...] } }`.
- Every successful write calls `revalidateTag("transactions")` AND `revalidateTag("dashboard")` per D-39.
- Live Neon EU verified: 119/119 tests pass, npm run lint clean, npm run typecheck clean.

## Tasks Completed

| Task | Description | Commits |
|------|-------------|---------|
| 1 | TDD lib/dedup.ts (D-22 SHA-256 + normalize) — 14 tests | 75f1806 (RED) → 92e072d (GREEN) |
| 2 | TDD app/(authenticated)/actions/transactions.ts — 4 Server Actions, 10 integration tests | 9a8c7b1 (RED) → 724e873 (GREEN) |

All commits scoped to `feat(02-03)` / `test(02-03)` per repo convention.

## Discriminated-Union Result Shapes (for Plan 05 client form pattern-match)

```typescript
export type AddTransactionResult =
  | { ok: true; id: string }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "duplicate" }
  | { ok: false; kind: "server_error" };

export type EditTransactionResult =
  | { ok: true }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "server_error" };

export type SoftDeleteResult =
  | { ok: true }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "server_error" };

export type RestoreResult = SoftDeleteResult;
```

Plan 05 (form Client Component) switches on `result.kind` to pick the right Spanish copy:

| `kind` | Spanish copy (per CONTEXT specifics) |
|--------|--------------------------------------|
| `validation` | per-field; from `result.fieldErrors` |
| `duplicate` | "Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?" |
| `not_found` | "Esta transacción ya no existe. Puede que la hayas borrado en otra pestaña." (Plan 06 picks final wording) |
| `server_error` | "Ha ocurrido un error inesperado. Reintenta o contacta soporte." (generic) |

## Session-Injection Scaffold for Vitest (T-02-07 Mitigation)

The test file mocks `@/lib/auth` at the module-load top:

```typescript
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "test-owner-id", email: "owner@test.local", name: "Owner" },
        session: { id: "test-session-id" },
      }),
    },
  },
}));
```

This replaces `auth.api.getSession` with a stub returning a fake session object. The production code path is **unchanged**: every action still calls `auth.api.getSession({ headers })` at entry. There is no `NODE_ENV === "test"` short-circuit anywhere in `app/(authenticated)/actions/transactions.ts` (verified by `grep -F "NODE_ENV" → 0 lines`).

The Playwright suite (Plan 09) exercises the real session-required path end-to-end through HTTP (login → submit form → assert insert) so the production session check is covered without an env bypass.

`next/headers` is also stubbed (returns an empty `Headers()` object) and `next/cache` (`updateTag` + `revalidateTag` as `vi.fn()` no-ops) because both primitives are designed for a real Next request context that Vitest cannot reproduce.

## Sample Log Lines — Pino Redaction Proof

Captured live from the Vitest run (`npm test -- --run app/\(authenticated\)/actions/transactions.test.ts`). The `description_raw` field is replaced with `[REDACTED]` per the FND-04 / D-14 redact list configured in `lib/logger.ts`:

```
[2026-05-02 12:08:38.227 +0200] INFO: transaction_added
    id: "9e587fb7-d39e-43ea-ad36-69148460d748"
    kind: "transaction_added"
    description_raw: "[REDACTED]"

[2026-05-02 12:08:38.849 +0200] INFO: transaction_duplicate_rejected
    kind: "duplicate"
    account_id: "da489ded-92f8-4561-805a-05eb850bebb5"

[2026-05-02 12:08:39.203 +0200] INFO: transaction_edited
    id: "a045ff51-8522-4f96-a23d-fec158f38f34"
    kind: "transaction_edited"
    description_raw: "[REDACTED]"
```

Note that the `transaction_duplicate_rejected` line (T-02-11) deliberately omits `description_raw` entirely — even the redacted form is never emitted on the dup-collision branch, defense-in-depth against any redact-rule regression.

## Test Counts (RED → GREEN)

| Suite | RED | GREEN | Notes |
|-------|-----|-------|-------|
| `lib/dedup.test.ts` | failed (module not found) | **14 passed** | 5 normalizeDescription + 9 computeManualDedupKey cases |
| `app/(authenticated)/actions/transactions.test.ts` | failed (module not found) | **10 passed** | All against live Neon EU; describe.skipIf(!RUN) keeps DB-less CI green |
| **Total project** | — | **119 passed (6 files)** | npm run lint + npm run typecheck both clean |

## Threat-Model Coverage

All STRIDE threats from the plan's `<threat_model>` are mitigated:

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-02-05 (Tampering: oversized description) | Zod `.min(1).max(200)`; description_raw on Pino redact list |
| T-02-06 (Info Disclosure on mutation error) | `logger.error({ err: err instanceof Error ? err.message : String(err) }, ...)` — never the full payload |
| T-02-07 (Elevation of Privilege) | `ensureSession()` calls real `auth.api.getSession`; no `NODE_ENV` bypass; tests inject via vi.mock |
| T-02-08 (Tampering: amount ≤ 0) | Zod `.refine(cents > 0n)` + Phase 1 DB CHECK constraint |
| T-02-09 (Tampering: forged category_id) | FK 23503 → translated to `kind:"validation"` with `fieldErrors.category_id` |
| T-02-10 (DoS dedup-retry storm) | dedup_key includes `floor(anchorMs / 60_000)` so only ≤60s double-clicks collide |
| T-02-11 (Info Disclosure on dup-violation log) | dup-rejection log line carries only `{ kind, account_id }` — never description_raw |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Next 16 changed the `revalidateTag` signature**

- **Found during:** Task 2 GREEN typecheck pass
- **Issue:** Next 16 made the second `profile` argument of `revalidateTag(tag, profile)` mandatory at the TS-types layer. The runtime still accepts the legacy single-arg form (only emits a deprecation warning) but `tsc --noEmit` failed with 8 `TS2554 Expected 2 arguments, but got 1` errors against the four mutation paths.
- **Fix:** Imported `updateTag` from `next/cache` (the canonical Next 16 Server Action mutation API with read-your-own-writes semantics) and aliased the legacy `revalidateTag` import as `revalidateTagLegacy`. Defined a local single-arg `function revalidateTag(tag: string)` wrapper that delegates to `updateTag(tag)` so the four mutation call sites still read as `revalidateTag("transactions"); revalidateTag("dashboard");` — preserving the literal D-39 invariant grep (`grep -c 'revalidateTag("transactions")' → 5`). Re-exported `revalidateTagLegacy` as `revalidateTagRoute` for future non-action callers (cron handlers, webhook routes).
- **Files modified:** `app/(authenticated)/actions/transactions.ts` (import block + local wrapper); `app/(authenticated)/actions/transactions.test.ts` (mock now stubs both `updateTag` and `revalidateTag`).
- **Commit:** `724e873`
- **Rationale:** The plan's acceptance criteria predate Next 16's API split. The fix preserves the plan's invariant grep AND uses the type-correct, Next-16-canonical Server Action API for cache invalidation.

**2. [Rule 3 — Blocking issue] Drizzle/Neon error shape: SQLSTATE on `.cause`, not top-level**

- **Found during:** Task 2 GREEN test run (2/10 tests failed: FK-violation and dup-collision both returned `kind:"server_error"` instead of `kind:"validation"`/`kind:"duplicate"`)
- **Issue:** The original `isUniqueViolation` / `isFkViolation` helpers checked `(err as { code: string }).code === "23505"` — but Drizzle's neon-http driver wraps Neon errors in `DrizzleQueryError`, which carries the underlying `NeonDbError` (with the SQLSTATE `code`) on its `.cause` property. Top-level `.code` is undefined, so both branches missed and fell through to `kind:"server_error"`.
- **Fix:** Introduced `pgErrorCode(err)` that walks the `.cause` chain (max 3 hops) and returns the first string `code` it finds. Both `isUniqueViolation` / `isFkViolation` now compare against the chain-walked code.
- **Files modified:** `app/(authenticated)/actions/transactions.ts` (helpers section).
- **Commit:** `724e873` (combined with the GREEN implementation)
- **Verification:** All 10 integration tests pass; the FK-violation test now correctly receives `kind:"validation"` and the dup-collision test receives `kind:"duplicate"`.

### Items Out of Scope for This Plan

None — the plan's success criteria all map to acceptance criteria above.

## Self-Check: PASSED

Verified after writing the SUMMARY:

- `lib/dedup.ts` exists ✓
- `lib/dedup.test.ts` exists ✓
- `app/(authenticated)/actions/transactions.ts` exists ✓
- `app/(authenticated)/actions/transactions.test.ts` exists ✓
- Commit `75f1806` (test RED dedup) found in git log ✓
- Commit `92e072d` (feat GREEN dedup) found in git log ✓
- Commit `9a8c7b1` (test RED actions) found in git log ✓
- Commit `724e873` (feat GREEN actions) found in git log ✓
- `grep -c 'revalidateTag("transactions")' → 5` (≥4) ✓
- `grep -c 'revalidateTag("dashboard")' → 5` (≥4) ✓
- `grep -F "NODE_ENV" → 0` (T-02-07 invariant) ✓
- Final `npm run lint` + `npm run typecheck` + `npm test -- --run` all exit 0 ✓
