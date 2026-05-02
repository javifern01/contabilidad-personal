---
phase: 02-manual-tracker-mvp
plan: 02
subsystem: ui-foundation
tags: [shadcn, ui-primitives, nuqs, format, intl, dst, spanish-locale, wave1]
requires:
  - components/ui/button.tsx (Phase 1)
  - components/ui/card.tsx (Phase 1)
  - components/ui/input.tsx (Phase 1)
  - lib/format.ts formatDateShortEs (Phase 1)
  - lib/utils.ts cn helper (Phase 1)
provides:
  - components/ui/sheet.tsx (Sheet/SheetTrigger/SheetContent/SheetHeader/SheetFooter/SheetTitle/SheetDescription/SheetClose)
  - components/ui/select.tsx (Select primitive grouped by kind)
  - components/ui/badge.tsx (Manual badge per D-29)
  - components/ui/table.tsx (transaction list)
  - components/ui/tabs.tsx (top nav)
  - components/ui/skeleton.tsx (loading state per D-28)
  - components/ui/popover.tsx (multi-select category filter container)
  - components/ui/checkbox.tsx (multi-select category checkboxes)
  - lib/format.ts → formatMonthEs(year, month): "Mayo 2026"
  - nuqs@~2.8.9 dependency
affects:
  - Plan 02-05 (will import Sheet, Select, Badge, Table, Tabs, Skeleton)
  - Plan 02-06 (will import Popover, Checkbox for LIST-03 multi-select)
  - Plan 02-07 (will import Tabs, Skeleton for dashboard)
  - Plan 02-08 (will import nuqs for URL state)
tech-stack:
  added:
    - "nuqs@~2.8.9 (URL-state library, tilde pin per CLAUDE.md)"
  patterns:
    - "shadcn primitives via npx shadcn add — registry-based copy-in, no @radix-ui needed (Phase 1 chose @base-ui/react)"
    - "TDD for format helpers (RED → GREEN gates committed separately)"
    - "Day-15 + 12:00 UTC anchor strategy to avoid DST month-drift in Intl.DateTimeFormat"
key-files:
  created:
    - components/ui/sheet.tsx
    - components/ui/select.tsx
    - components/ui/badge.tsx
    - components/ui/table.tsx
    - components/ui/tabs.tsx
    - components/ui/skeleton.tsx
    - components/ui/popover.tsx
    - components/ui/checkbox.tsx
    - .planning/phases/02-manual-tracker-mvp/deferred-items.md
  modified:
    - lib/format.ts (added formatMonthEs)
    - lib/format.test.ts (added 6 formatMonthEs tests + import)
    - package.json (added nuqs)
    - package-lock.json
decisions:
  - "Use shadcn CLI in non-interactive mode (-y --silent) — produces 8 components built on @base-ui/react (already a Phase 1 dep), no @radix-ui peer install required"
  - "Strip ICU's ' de ' connector ('mayo de 2026' → 'mayo 2026') then capitalize first letter — D-41 requires bare 'Mayo 2026'"
  - "Day-15 + 12:00 UTC anchor for formatMonthEs — Madrid DST (last Sunday of March/October) cannot drift mid-month, while pure year+month+timezone formatting on day=1+00:00 UTC could land on the previous month"
metrics:
  duration: ~6 minutes wall-clock
  tasks_completed: 2
  commits: 3 (1 feat for primitives + nuqs, 1 test RED, 1 feat GREEN)
  tests_added: 6
  tests_total_file: 40 passing in lib/format.test.ts
  files_created: 9
  files_modified: 4
  completed_date: 2026-05-02
---

# Phase 2 Plan 02: Wave-1 Wiring Summary

shadcn primitives (sheet, select, badge, table, tabs, skeleton, popover, checkbox), `formatMonthEs(year, month) → "Mayo 2026"` with DST-safe day-15 anchor, and `nuqs@~2.8.9` URL-state library — pre-installed in Wave 1 to unblock Plans 05/06/07/08 from waiting on shadcn CLI prompts or surprise installs.

## What was built

### Task 1: shadcn primitives + nuqs (commit `d68d19a`)

Ran `npx shadcn@latest add sheet select badge table tabs skeleton popover checkbox -y --silent` — single shot, non-interactive. The shadcn CLI generated 8 components under `components/ui/` matching the Phase 1 `base-nova` style (built on `@base-ui/react` rather than `@radix-ui`). No new peer dependencies required: `@base-ui/react` was already in Phase 1's dependency set. Phase 1 primitives (`avatar`, `button`, `card`, `dropdown-menu`, `form`, `input`, `label`, `sonner`) untouched.

Then `npm install nuqs@~2.8.9` added the URL-state library with the tight tilde pin from CLAUDE.md (allows patch updates within `2.8.x`, rejects `2.9.x`+).

`npx tsc --noEmit` exits 0 — all 8 primitives compile clean against React 19 + Next 16 + strict TS.

### Task 2: formatMonthEs (TDD)

**RED commit `5432e2b`** — Added 6 failing tests in `lib/format.test.ts`:
1. `formatMonthEs(2026, 5) === "Mayo 2026"` (canonical D-41 example)
2. `formatMonthEs(2026, 1) === "Enero 2026"` (January boundary)
3. `formatMonthEs(2026, 12) === "Diciembre 2026"` (December boundary)
4. `formatMonthEs(2026, 3) === "Marzo 2026"` (DST spring-forward — last Sun of March)
5. `formatMonthEs(2026, 10) === "Octubre 2026"` (DST fall-back — last Sun of October)
6. All 12 months of 2026 return `/^[A-Z]/` capitalized + `/\s\d{4}$/` year suffix

Tests failed with `TypeError: formatMonthEs is not a function` — RED gate satisfied.

**GREEN commit `17741f8`** — Implemented `formatMonthEs` in `lib/format.ts`:
- `Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: TZ_MADRID })`
- Anchor: `new Date(Date.UTC(year, month - 1, 15, 12, 0, 0))` — day 15 at noon UTC stays safely inside the target month in Madrid regardless of CET/CEST transitions
- Strip `" de "` connector, then `.charAt(0).toUpperCase() + slice(1)` (Spanish month names are pure ASCII so `.toUpperCase()` is safe — no Unicode first-letter pitfalls)

All 40 tests in `lib/format.test.ts` pass (34 pre-existing + 6 new). `npx tsc --noEmit` exits 0.

REFACTOR phase: implementation already mirrors the existing `formatDateShortEs` pattern and is heavily commented. No refactor commit warranted.

## Sample output

```ts
formatMonthEs(2026, 5);   // "Mayo 2026"
formatMonthEs(2026, 1);   // "Enero 2026"
formatMonthEs(2026, 12);  // "Diciembre 2026"
formatMonthEs(2026, 3);   // "Marzo 2026"   (DST spring-forward)
formatMonthEs(2026, 10);  // "Octubre 2026" (DST fall-back)
```

## Final file list (no shadcn renames)

| Path                          | Status     | Notes                                            |
| ----------------------------- | ---------- | ------------------------------------------------ |
| `components/ui/sheet.tsx`     | created    | Sheet/SheetContent etc., side="bottom" or "right" |
| `components/ui/select.tsx`    | created    | Group + GroupLabel for kind-grouped options      |
| `components/ui/badge.tsx`     | created    | variant prop incl. secondary (Manual badge)      |
| `components/ui/table.tsx`     | created    | Table/TableHeader/TableBody/TableRow/TableCell   |
| `components/ui/tabs.tsx`      | created    | Tabs/TabsList/TabsTrigger/TabsContent            |
| `components/ui/skeleton.tsx`  | created    | animate-pulse rectangle                          |
| `components/ui/popover.tsx`   | created    | Popover/PopoverTrigger/PopoverContent            |
| `components/ui/checkbox.tsx`  | created    | Checkbox primitive (base-ui)                     |
| `lib/format.ts`               | modified   | + formatMonthEs                                  |
| `lib/format.test.ts`          | modified   | + 6 tests + import                               |
| `package.json`                | modified   | + nuqs@~2.8.9                                    |
| `package-lock.json`           | modified   | (transitive)                                     |

The shadcn registry exposed all 8 names directly (no `drawer` substitution needed — D-23 `Sheet` semantics preserved).

## nuqs version verified

```bash
$ node -e "console.log(JSON.stringify(require('./package.json').dependencies.nuqs))"
"~2.8.9"
```

Matches CLAUDE.md tight pin and the regex `^~?2\.8\.[0-9]+$` from the plan's acceptance criteria.

## Deviations from Plan

None — plan executed exactly as written. Two notes on benign discoveries that did NOT require deviation rules:

1. **shadcn primitives use `@base-ui/react` not `@radix-ui`.** The plan's Step 3 anticipated potentially needing `npm install @radix-ui/react-dialog ...` if peer deps were missing. They weren't — Phase 1's `components.json` `style: "base-nova"` instructs the registry to emit `@base-ui/react`-based components, and `@base-ui/react@^1.4.1` is already a Phase 1 dependency. Result: no extra peer-dep installs needed.
2. **shadcn registry exposed `sheet` directly.** The plan's `<action>` had a fallback for `drawer` substitution. Not needed — `sheet` was available verbatim. D-23 `Sheet` semantics preserved without any plan-update bookkeeping.

## Authentication gates

None — no auth required for this plan.

## Deferred Issues

15 pre-existing test failures in `lib/crypto.test.ts` (and `lib/auth-rate-limit.test.ts` import-time failure) were observed during the `npm test -- --run` final-verification step. They are caused by missing `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` env vars at test-runner time and exist on the base commit (`b6d7f0b`) before any of this plan's commits — verified by checking out base test files and re-running.

These are out of scope for Plan 02-02 (UI foundation + format helper) and are documented in `.planning/phases/02-manual-tracker-mvp/deferred-items.md` for the verifier or a follow-up dev-environment plan.

The plan-scoped tests (`lib/format.test.ts`) are green: 40/40 passing.

## TDD Gate Compliance

Task 2 followed RED → GREEN sequence with separate commits:
- `5432e2b` `test(02-02): add failing tests for formatMonthEs (RED)`
- `17741f8` `feat(02-02): implement formatMonthEs for Spanish month labels (GREEN)`

`git log --oneline` confirms ordering. REFACTOR not required (implementation small, idiomatic, fully covered).

## Self-Check

| Item                                          | Status |
| --------------------------------------------- | ------ |
| `components/ui/sheet.tsx` exists              | FOUND  |
| `components/ui/select.tsx` exists             | FOUND  |
| `components/ui/badge.tsx` exists              | FOUND  |
| `components/ui/table.tsx` exists              | FOUND  |
| `components/ui/tabs.tsx` exists               | FOUND  |
| `components/ui/skeleton.tsx` exists           | FOUND  |
| `components/ui/popover.tsx` exists            | FOUND  |
| `components/ui/checkbox.tsx` exists           | FOUND  |
| `lib/format.ts` exports formatMonthEs         | FOUND  |
| `lib/format.test.ts` has 6 new tests          | FOUND  |
| `package.json` records `nuqs: ~2.8.9`         | FOUND  |
| Commit `d68d19a` (primitives + nuqs)          | FOUND  |
| Commit `5432e2b` (RED)                        | FOUND  |
| Commit `17741f8` (GREEN)                      | FOUND  |
| `npm run lint` exits 0                        | PASSED |
| `npm run typecheck` exits 0                   | PASSED |
| `npm test -- --run lib/format.test.ts` 40/40  | PASSED |

## Self-Check: PASSED
