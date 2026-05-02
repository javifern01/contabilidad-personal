---
phase: 02-manual-tracker-mvp
plan: 08
subsystem: authenticated-shell
tags: [layout, navigation, client-components, mobile-responsive, accessibility]
dependency_graph:
  requires:
    - app/(authenticated)/layout.tsx (Phase 1 D-07 — extended in place)
    - components/auth/user-menu.tsx (Phase 1 — props contract preserved verbatim)
    - components/ui/button.tsx (Phase 1 — used by AddFab "header" variant)
    - lucide-react (Plus icon — already in package.json)
  provides:
    - app/(authenticated)/_components/TopNav.tsx (desktop top nav, active highlighting)
    - app/(authenticated)/_components/AddFab.tsx (persistent "+ Añadir" trigger; header + mobile variants)
    - app/(authenticated)/_components/MobileBottomNav.tsx (mobile-only fixed-bottom 3-tab nav)
    - Modified app/(authenticated)/layout.tsx wiring all three into the shell
  affects:
    - Plan 02-05 QuickAddSheet (consumes ?nuevo=1 set by AddFab on /transacciones)
    - Plan 02-06 transactions list page (rendered inside this shell)
    - Plan 02-07 dashboard page (rendered inside this shell)
    - Plan 02-09 E2E (asserts nav flow + filter-preservation behavior)
tech_stack:
  added: []
  patterns:
    - "use client" hooks (usePathname, useRouter, useSearchParams) for active-state + URL-state preservation
    - URL-state preservation via new URLSearchParams(searchParams.toString()) before .set("nuevo", "1") — survives mid-session filters (q, pag, cat, min, max, desde, hasta)
    - Tailwind responsive visibility split (hidden sm:flex / hidden sm:block / sm:hidden) instead of conditional rendering — avoids hydration mismatch and keeps both layouts SSR-consistent
    - Lucide icons (Plus) wrapped with aria-hidden="true" alongside an explicit aria-label on the button — icon is decorative, label carries semantics
    - Flex-1 centred TopNav between brand (left) and user controls (right) so the header remains balanced across viewport widths
key_files:
  created:
    - path: app/(authenticated)/_components/TopNav.tsx
      purpose: Desktop top nav with two links (Resumen / Transacciones) and active-state highlight via usePathname
    - path: app/(authenticated)/_components/AddFab.tsx
      purpose: Persistent "+ Añadir" trigger with two variants ("header" + "mobile") that appends ?nuevo=1 while preserving existing search params on /transacciones
    - path: app/(authenticated)/_components/MobileBottomNav.tsx
      purpose: Mobile-only fixed-bottom 3-tab nav wrapping AddFab between Resumen and Transacciones
  modified:
    - path: app/(authenticated)/layout.tsx
      purpose: Wires TopNav (desktop), AddFab header variant (desktop), MobileBottomNav (mobile); adds pb-16 sm:pb-0 on <main> so mobile content does not sit under the bottom bar; preserves Phase 1 D-07 session check, brand div, and UserMenu props verbatim
decisions:
  - 'Used Lucide <Plus /> icon (already in package.json via Phase 1 shadcn primitives) for the "+" symbol in both AddFab variants — consistent with the rest of the shadcn-based UI; emoji rejected because it does not honour the foreground/text-foreground colour tokens'
  - "Tailwind breakpoint chosen for the mobile/desktop split: sm: (640px) — matches the plan spec and is already the default shadcn/ui breakpoint for header collapse"
  - "AddFab on /transacciones preserves the entire current search-param set (q, pag, cat, min, max, desde, hasta, ...) before adding nuevo=1 — fixes the dead branch the plan explicitly called out where filters were silently dropped mid-session (Plan 09 E2E asserts this)"
  - "MobileBottomNav uses a non-Link <button> for the AddFab so that the FAB action is consistent (it always invokes the same onClick handler) regardless of whether the user is already on /transacciones"
metrics:
  duration: ~3 min wall-clock
  tasks_completed: 2 (TopNav+AddFab+MobileBottomNav creation, layout wiring)
  files_changed: 4 (3 new components + 1 modified layout)
  completed_date: 2026-05-02
requirements: [UX-02, UX-03]
---

# Phase 2 Plan 08: Authenticated Layout + Nav Summary

**One-liner:** Wires Resumen ↔ Transacciones navigation and a persistent "+ Añadir" trigger into the (authenticated) shell — desktop header gets TopNav + AddFab + UserMenu, mobile gets a fixed-bottom 3-tab nav with the FAB centred, and the AddFab on /transacciones preserves existing filter search-params when opening the QuickAddSheet.

## Outcome

Users can now move between the dashboard (`/`) and the transaction list (`/transacciones`) without using the browser URL bar, and can summon the QuickAddSheet (Plan 05) from anywhere inside the (authenticated) group via a persistent "+ Añadir" button.

After completion:
- Desktop ≥640px: header renders `[brand] [TopNav (centre)] [AddFab + UserMenu]` on a single row.
- Mobile <640px: header renders `[brand] [UserMenu]`; a fixed-bottom 3-tab `<nav>` shows `[Resumen] [+ Añadir] [Transacciones]` with the FAB visually centred.
- Active link in both nav components uses the `foreground` colour token; inactive uses `muted-foreground` with a hover transition.
- AddFab on `/transacciones` calls `router.push('/transacciones?{preserved-params}&nuevo=1')`; on any other (authenticated) route it calls `router.push('/transacciones?nuevo=1')`.
- Phase 1 contracts are intact: the session check (`if (!session) redirect("/login")`) sits at line 29 of `app/(authenticated)/layout.tsx`, the brand div ("Contabilidad Personal") is rendered, and `UserMenu` receives the same `{ name, email, image }` props it had in Phase 1.
- `npm run lint`, `npm run typecheck`, and `npx next build` all exit 0. The full Vitest suite (130/130) still passes.

## Final Component Surfaces

```typescript
// TopNav.tsx — desktop only (parent layout wraps it in `hidden sm:flex`)
export function TopNav(): JSX.Element;

// AddFab.tsx — both variants exported from one component
export function AddFab(props: { variant?: "header" | "mobile" }): JSX.Element;

// MobileBottomNav.tsx — mobile only (handles its own visibility via sm:hidden)
export function MobileBottomNav(): JSX.Element;
```

## Plan-Required Output Items

The plan's `<output>` block specifically asked for confirmation of three items:

1. **Icon vs emoji for the "+" symbol:** Lucide `<Plus />` icon used in both AddFab variants (header: `mr-1 h-5 w-5`; mobile: `h-6 w-6`). Lucide chosen over an emoji because it honours the design token system (currentColor) and matches the rest of the shadcn-based UI surfaces (e.g. UserMenu's avatar fallback rendering).

2. **Tailwind breakpoint for mobile/desktop split:** `sm:` (640px). Used consistently:
   - `hidden sm:flex` on TopNav wrapper
   - `hidden sm:block` on AddFab header wrapper
   - `sm:hidden` on MobileBottomNav `<nav>`
   - `pb-16 sm:pb-0` on `<main>` (clearance for the mobile bottom bar)
   - `px-4 py-3 sm:px-6` on `<header>` (slightly tighter mobile padding)

3. **Phase 1 redirect preserved:** `if (!session) redirect("/login");` sits at **line 29** of `app/(authenticated)/layout.tsx` (was line 22 in Phase 1 — line shifted only because additional imports were added above). Verified via `grep -n 'redirect("/login")' app/(authenticated)/layout.tsx`.

## Key Files

### Created
| File | Lines | Purpose |
|------|-------|---------|
| `app/(authenticated)/_components/TopNav.tsx` | 49 | Desktop 2-link top nav |
| `app/(authenticated)/_components/AddFab.tsx` | 60 | Persistent "+ Añadir" trigger (header + mobile variants) |
| `app/(authenticated)/_components/MobileBottomNav.tsx` | 63 | Mobile-only fixed-bottom 3-tab nav |

### Modified
| File | Change |
|------|--------|
| `app/(authenticated)/layout.tsx` | +28 / -12 lines — added 3 imports + nav slots in the header + MobileBottomNav after `<main>` + `pb-16 sm:pb-0` clearance class |

## Verification

- `npm run lint` → exit 0
- `npm run typecheck` → exit 0
- `npx next build` → exit 0 (compiled successfully in 3.4s; 4 routes generated)
- `npm test` → 130/130 passing (no Phase 2 test regressions; this plan adds no new tests — Plan 09 E2E covers the nav flow end-to-end as the plan specifies)

## Spanish Copy Audit

All user-visible copy is Spanish, verbatim per the plan:

| Surface | Copy |
|---------|------|
| TopNav link 1 | `Resumen` |
| TopNav link 2 | `Transacciones` |
| AddFab label (both variants) | `Añadir` |
| AddFab aria-label (both variants) | `Añadir transacción` |
| TopNav aria-label | `Navegación principal` |
| MobileBottomNav aria-label | `Navegación inferior` |
| MobileBottomNav link 1 | `Resumen` |
| MobileBottomNav link 2 | `Transacciones` |
| Header brand (preserved from Phase 1) | `Contabilidad Personal` |
| UserMenu fallback (preserved from Phase 1) | `Propietario` / `Cerrar sesión` / `Abrir menú de usuario` |

No English fallbacks anywhere.

## Deviations from Plan

None - plan executed exactly as written.

The AddFab `useSearchParams` + `URLSearchParams` filter-preservation behaviour was already specified in the plan (the plan explicitly called out the previous "always router.push to a fresh URL" pattern as a dead branch) — implemented exactly as written; not a deviation.

## Authentication Gates

None encountered. All build / typecheck / lint / test commands run without auth.

## Known Stubs

None. All three components are fully wired:
- TopNav reads pathname via `usePathname()` (no mock state)
- AddFab uses `useRouter()` + `useSearchParams()` for live URL state
- MobileBottomNav embeds AddFab with `variant="mobile"` (no placeholder)
- Layout wires all three into the real Phase 1 session-gated shell

## Hand-off to Plan 09 (E2E)

Plan 09's E2E will cover:
- `usePathname` active-state highlighting on Resumen vs Transacciones
- AddFab on `/` → navigates to `/transacciones?nuevo=1`
- AddFab on `/transacciones?q=café&cat=food` → navigates to `/transacciones?q=café&cat=food&nuevo=1` (filter preservation)
- Mobile viewport: bottom nav visible, header AddFab + TopNav hidden
- Desktop viewport: bottom nav hidden, header AddFab + TopNav visible
- UserMenu still functional after Plan 08 (no Phase 1 regression)

## Self-Check: PASSED

Created files verified to exist:
- FOUND: `app/(authenticated)/_components/TopNav.tsx`
- FOUND: `app/(authenticated)/_components/AddFab.tsx`
- FOUND: `app/(authenticated)/_components/MobileBottomNav.tsx`
- FOUND: `app/(authenticated)/layout.tsx` (modified)

Commits verified in git log:
- FOUND: `f822d97` — feat(02-08): add TopNav, AddFab, MobileBottomNav client components
- FOUND: `674beeb` — feat(02-08): wire TopNav, AddFab and MobileBottomNav into authenticated layout
