# Phase 2 Deferred Items

Items discovered during execution but explicitly out of scope for the current plan.

## From Plan 02-02 (Wave 1 wiring)

### Pre-existing test failures requiring env setup (out of scope)

**Discovered during:** Plan 02-02 final verification (`npm test -- --run`)

**Status:** Pre-existing on `b6d7f0b` base commit — confirmed by checking out base test files and re-running. Not introduced by Plan 02-02.

**Failures:**

1. `lib/crypto.test.ts` — 15/17 failing because:
   - `ENCRYPTION_KEY` env var missing (32-byte base64 required)
   - `BETTER_AUTH_SECRET` missing
   - `BETTER_AUTH_URL` missing

   `lib/env.ts` Zod validator throws on import when these are absent, so the
   crypto round-trip / tamper-detection tests cannot even instantiate the cipher.

2. `lib/auth-rate-limit.test.ts` — fails to load (same env-var preflight cause).

**Mitigation in this plan:** None. These are infrastructure/env concerns, not
caused by adding shadcn primitives or `formatMonthEs`. The Plan 02-02 scope
covers the format helper tests (which all pass: 40/40 in `lib/format.test.ts`)
and shadcn primitives (TS compile clean).

**Suggested follow-up:** Phase 2 verifier or a dedicated dev-environment plan
should:
- Add `vitest.setup.ts` shim that injects synthetic test env vars before module
  import, OR
- Wrap each affected test file with a `describe.skipIf(!process.env.ENCRYPTION_KEY)`
  guard mirroring the `lib/auth-rate-limit.test.ts` `RUN = !!process.env.DATABASE_URL`
  pattern already used elsewhere, OR
- Provide a `.env.test` template the test runner reads.
