---
phase: 02-manual-tracker-mvp
plan: 05
subsystem: manual-entry-ui
tags:
  - quick-add-form
  - edit-form
  - sheet
  - select
  - nuqs
  - react-19-form-actions
  - sonner-toast
  - client-component
dependency_graph:
  requires:
    - 02-01-PLAN  # transactions/categories schema → Category type, addTransaction returning shape
    - 02-02-PLAN  # shadcn sheet/select primitives
    - 02-03-PLAN  # addTransaction / editTransaction Server Actions + result discriminated unions
  provides:
    - QuickAddSheet client component (consumed by Plan 06 transacciones page + Plan 08 layout FAB)
    - CategorySelect client component (reusable by Phase 3 override flows)
  affects:
    - app/(authenticated)/transacciones/_components/  (new directory)
tech_stack:
  added:
    - nuqs (was declared in package.json but missing from node_modules — installed 2.8.9)
  patterns:
    - React 19 form action with useFormStatus pending state
    - URL-bound modal state via nuqs useQueryState (D-23)
    - matchMedia-driven viewport-adaptive Sheet side
    - Discriminated-union result switching for Spanish UX copy
    - HTML form attribute to associate footer-rendered submit button with form by id
key_files:
  created:
    - "app/(authenticated)/transacciones/_components/CategorySelect.tsx"
    - "app/(authenticated)/transacciones/_components/QuickAddSheet.tsx"
  modified: []
decisions:
  - shadcn Select is a base-ui Select.Root that natively binds to FormData via the name prop — no manual hidden input needed
  - SubmitButton lives in SheetFooter outside the form DOM tree; uses HTML form={formId} attribute so the button still triggers the action
  - Mobile detection via matchMedia in useEffect (default first render = "right" to avoid SSR hydration mismatch)
  - editar URL param wins over nuevo if both are simultaneously present (avoids ambiguous state)
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  completed_date: "2026-05-02"
requirements:
  - MAN-01
  - MAN-02
  - MAN-03
  - UX-02
---

# Phase 2 Plan 05: QuickAddSheet + CategorySelect Summary

**One-liner:** Two client components — `QuickAddSheet` (4-field add/edit form bound to `?nuevo=1` / `?editar={id}` URL state, sonner toast on success, inline Spanish errors) and `CategorySelect` (kind-grouped Gastos/Ingresos/Movimientos Select extracted for Phase 3 reuse) — that drive the manual transaction add/edit UX (D-23..D-26).

## What was built

### `app/(authenticated)/transacciones/_components/CategorySelect.tsx` (114 lines)
- Wraps the shadcn `Select` (which is itself a base-ui `Select.Root`).
- Renders three groups in fixed order:
  1. **Gastos** (`kind === 'expense'`)
  2. **Ingresos** (`kind === 'income'`)
  3. **Movimientos** (`kind === 'transfer'`)
- Items inside each group are sorted by `sortOrder ASC, name ASC` (Spanish collation `localeCompare("es-ES")`).
- Empty groups are dropped so we never render an empty `<SelectGroup>`.
- Supports both controlled (`value` + `onValueChange`) and uncontrolled (`defaultValue`) modes.
- Form-data binding goes through the base-ui Select's native `name` prop (no manual hidden input — see "Hidden input investigation" below).

### `app/(authenticated)/transacciones/_components/QuickAddSheet.tsx` (~360 lines)
- Renders 4 form fields exactly in this keyboard-flow order (D-24):
  1. **Importe** — `<Input inputMode="decimal" autoFocus required maxLength={20}>`, placeholder `0,00 €`
  2. **Fecha** — `<Input type="date" required>`, defaultValue = today (local-component YYYY-MM-DD)
  3. **Descripción** — `<Input maxLength={200} required>`, placeholder `Ej: Café del trabajo`
  4. **Categoría** — `<CategorySelect required>` (the component above)
- URL-bound mode (D-23):
  - `?editar={id}` → edit mode (parent passes `editTarget` with prefilled values)
  - `?nuevo=1` → add mode
  - `editar` wins over `nuevo` if both are set (avoids ambiguous state)
- Adaptive Sheet side: `bottom` on `<640px`, `right` on `≥640px`, via `matchMedia('(min-width: 640px)')` listener inside `useEffect`. First render defaults to `right` for SSR safety.
- React 19 `<form action={onSubmit}>` calls `addTransaction(formData)` or `editTransaction(id, formData)`.
- On success: `toast.success("Transacción añadida")` (add) or `toast.success("Cambios guardados")` (edit), then closes the sheet by clearing the URL param via nuqs.
- On `kind="validation"`: renders `fieldErrors[k][0]` below each input + a generic "Revisa los campos marcados." footer message.
- On `kind="duplicate"`: renders the verbatim CONTEXT/D-22 copy `Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?`.
- On `kind="not_found"` (edit-only): renders `La transacción no existe o ha sido borrada.`.
- On `kind="server_error"` and unknown: renders `No se ha podido guardar. Reintenta.`.
- `SubmitButtonForForm` lives in `SheetFooter` (outside the `<form>` DOM tree) and associates via the HTML `form={formId}` attribute so submit still triggers the React 19 action; `useFormStatus().pending` works because React 19 reads action state from the React tree, not the DOM tree.

## Hidden input investigation (resolves the plan's open question)

The plan said *"Note on form integration"* — verify whether the shadcn Select wrapper renders a hidden input. After reading `node_modules/@base-ui/react/select/root/SelectRoot.d.ts` (lines 17–27), confirmed:

```ts
inputRef?: React.Ref<HTMLInputElement> | undefined;  // "A ref to access the hidden input element."
name?: string | undefined;                            // "Identifies the field when a form is submitted."
form?: string | undefined;                            // "Identifies the form that owns the hidden input."
```

base-ui Select.Root **renders a hidden `<input>` internally** when `name` is passed. **No manual hidden input was needed.** The shadcn `Select` re-export at `components/ui/select.tsx` line 9 (`const Select = SelectPrimitive.Root`) preserves the prop pass-through, so `<Select name="category_id" required>` works directly with `<form action={onSubmit}>` and `FormData.get("category_id")` returns the chosen UUID.

## Confirmed Spanish copy (verbatim)

All copy is peninsular `tú`-form per FND-05.

| Surface | Copy |
|---------|------|
| Header (add) | `Añadir transacción` |
| Header (edit) | `Editar transacción` |
| Header description | `Completa los 4 campos. El signo (ingreso o gasto) lo determina la categoría.` |
| Submit button (add idle) | `Añadir transacción` |
| Submit button (add pending) | `Añadiendo...` |
| Submit button (edit idle) | `Guardar cambios` |
| Submit button (edit pending) | `Guardando...` |
| Cancel button | `Cancelar` |
| Importe placeholder | `0,00 €` |
| Descripción placeholder | `Ej: Café del trabajo` |
| Select placeholder | `Selecciona una categoría` |
| Group label expense | `Gastos` |
| Group label income | `Ingresos` |
| Group label transfer | `Movimientos` |
| Toast (add success) | `Transacción añadida` |
| Toast (edit success) | `Cambios guardados` |
| Validation footer | `Revisa los campos marcados.` |
| Duplicate error (D-22) | `Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?` |
| Not-found error | `La transacción no existe o ha sido borrada.` |
| Server error | `No se ha podido guardar. Reintenta.` |

Inline field errors are passed through verbatim from Plan 03's Zod schema (e.g. `Importe no válido.`, `Fecha fuera de rango.`, `La descripción no puede superar los 200 caracteres.`, `Categoría no válida.`).

## Breakpoint chosen and caveats

- **Breakpoint:** `(min-width: 640px)` — matches Tailwind's `sm:` breakpoint, the standard mobile/desktop divider this codebase already uses.
- **Caveat 1 (SSR):** First server render and first client render both yield `side="right"` to avoid hydration mismatch. The matchMedia listener attaches in `useEffect` and may flip `side` to `"bottom"` on the first commit — Sheet is **closed** on initial render (URL param drives `isOpen`), so the user never sees a flash of wrong side.
- **Caveat 2 (legacy browsers):** Uses `mm.addEventListener("change", ...)` not `mm.addListener(...)`. Safari ≤ 13 used the deprecated API; CONTEXT canonical refs treat evergreen browsers as the baseline so this is acceptable.
- **Caveat 3 (matchMedia missing):** The effect short-circuits if `window.matchMedia` is unavailable (e.g. older test environments without jsdom matchMedia mock). `side` stays at `"right"` in that case — degrades to a usable desktop layout.

## Deviations from CONTEXT D-23..D-26

**None — CONTEXT specs followed verbatim.**

The plan template suggested using `parseAsBoolean` on `?nuevo=1`, but the implementation uses plain `useQueryState("nuevo")` and compares `nuevo === "1"`. This is functionally identical and avoids importing the `parseAsBoolean` helper for one comparison. The behavior matches D-23 exactly: `?nuevo=1` opens, anything else (incl. `?nuevo=0`) closes.

## Auto-fixed issues (Rule 3 — blocking dependency)

- **nuqs missing from `node_modules`** — `package.json` declared `nuqs: ~2.8.9` but the package was not installed. Resolution: `npm install nuqs` inside the parent worktree to populate the shared `node_modules`. No version change; package.json already pinned the correct version. This unblocks Plan 05 and downstream Plan 06 / Plan 08 (which also need nuqs).

## Out-of-scope items (deferred to later plans)

- **NuqsAdapter mount in `(authenticated)/layout.tsx`** — `useQueryState` requires `<NuqsAdapter>` higher in the tree. CONTEXT-D-43 + Plan 06/08 modify the layout; the adapter mount lives there, not here. Logged in `deferred-items.md` for Plan 06/08 to action.
- **Parent RSC fetch for `editTarget`** — Plan 06's `transacciones/page.tsx` is responsible for reading `?editar={id}` server-side, fetching the row, and passing the result as `editTarget`. QuickAddSheet just consumes the prop.
- **Parent RSC compute for `defaultCategoryId`** — same: Plan 06 runs the "last-used or first-expense" SQL.
- **NavBar + FAB trigger** — Plan 08 adds the `+ Añadir` button that flips `?nuevo=1` on the current route.
- **End-to-end Playwright test** — Plan 09 (E2E suite) exercises the full add/edit flow including the toast and revalidation.

## Verification

```bash
$ npm run lint
> contabilidad-personal@0.1.0 lint
> eslint . --max-warnings=0
# (exit 0)

$ npm run typecheck
> contabilidad-personal@0.1.0 typecheck
> tsc --noEmit
# (exit 0)
```

Both gates pass. No unit tests added (per plan output: "E2E lives in Plan 09; the form is exercised there.").

## Self-Check: PASSED

- FOUND: `app/(authenticated)/transacciones/_components/CategorySelect.tsx`
- FOUND: `app/(authenticated)/transacciones/_components/QuickAddSheet.tsx`
- FOUND commit: `61ce581` (CategorySelect)
- FOUND commit: `69c50c0` (QuickAddSheet)
- VERIFIED: STATE.md and ROADMAP.md untouched (per executor prompt instruction)
- VERIFIED: lint exit 0
- VERIFIED: typecheck exit 0
- VERIFIED: all 14 acceptance-criteria grep checks across both tasks pass
