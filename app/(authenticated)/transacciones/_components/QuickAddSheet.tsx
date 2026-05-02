"use client";

/**
 * Quick-Add / Edit Sheet (D-23..D-26).
 *
 * URL state binds the open mode (D-23):
 *   ?nuevo=1     → add mode
 *   ?editar={id} → edit mode (parent supplies editTarget)
 *
 * Form layout (D-24, exact 4 fields, keyboard-flow order):
 *   1. Importe       — <input inputmode="decimal" autoFocus required>
 *   2. Fecha         — <input type="date" required defaultValue=today>
 *   3. Descripción   — <input maxlength=200 required>
 *   4. Categoría     — kind-grouped <Select> (CategorySelect)
 *
 * Sheet side adapts to viewport:
 *   <640px → side="bottom"  (mobile, thumb-friendly)
 *   ≥640px → side="right"   (desktop, list visible behind)
 *
 * Submission flow:
 *   - addMode    → addTransaction(formData)
 *   - editMode   → editTransaction(id, formData)
 *   On ok: sonner toast (D-24/D-25 copy) + close sheet via nuqs URL clear.
 *   On validation: render fieldErrors below each field (Spanish copy from Plan 03 Zod schema).
 *   On duplicate: render the canonical CONTEXT.md dedup-collision Spanish copy (D-22).
 *   On not_found / server_error: render generic Spanish error copy.
 *
 * Mobile detection: `window.matchMedia('(min-width: 640px)')` inside useEffect to
 * avoid SSR/hydration mismatch (default first render is "right"). The matchMedia
 * listener flips `side` once mounted, then on every viewport breakpoint cross.
 *
 * XSS (T-02-17): all user-derived strings (`errorMsg`, `fieldErrors[k][0]`,
 * `editTarget.descriptionRaw`) are rendered via React text interpolation. No
 * dangerouslySetInnerHTML. React JSX auto-escapes < > & " ' so injected HTML is inert.
 */

import { useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addTransaction,
  editTransaction,
  type AddTransactionResult,
  type EditTransactionResult,
} from "@/app/(authenticated)/actions/transactions";
import type { Category } from "@/drizzle/schema";
import { CategorySelect } from "./CategorySelect";

export interface QuickAddSheetProps {
  /** Full category list — fetched in the RSC parent (Plan 06) and passed down. */
  categories: Category[];
  /**
   * The category most recently used by the owner (computed by the RSC parent
   * via "SELECT category_id FROM transactions WHERE soft_deleted_at IS NULL
   * ORDER BY imported_at DESC LIMIT 1"). Falls back to first 'expense' kind
   * by name when the table is empty. May be null when no categories at all.
   */
  defaultCategoryId: string | null;
  /**
   * Edit-mode target (only set when ?editar={id} is present and the parent
   * fetched the row). When null/undefined the sheet operates in add mode.
   */
  editTarget?: {
    id: string;
    amountCents: bigint;
    bookingDate: string; // YYYY-MM-DD (date input expects this format)
    descriptionRaw: string;
    categoryId: string;
  } | null;
}

/**
 * Build today's calendar date in YYYY-MM-DD form. Uses local components so the
 * <input type="date"> defaults to "today in the user's TZ" (which for the
 * single-owner Spain user is Europe/Madrid) without DST drift.
 */
function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear().toString().padStart(4, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Render bigint cents as a Spanish-style decimal string for prefilling the
 * Importe input on edit. e.g. 1234n → "12,34", 100n → "1,00", 5n → "0,05".
 * Uses BigInt arithmetic only — never Number — to avoid float drift on large amounts.
 */
function centsToInputString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const major = abs / 100n;
  const minor = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${major.toString()},${minor}`;
}

export function QuickAddSheet({
  categories,
  defaultCategoryId,
  editTarget,
}: QuickAddSheetProps) {
  const [nuevo, setNuevo] = useQueryState("nuevo");
  const [editar, setEditar] = useQueryState("editar");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const formId = useId();

  // Mode is derived from URL — ?editar={id} wins over ?nuevo=1 if both present.
  const mode: "add" | "edit" = editar ? "edit" : "add";
  const isOpen = mode === "edit" ? !!editar : nuevo === "1";

  // Sheet side: defaults to "right" on first render (server-safe), flips to
  // "bottom" on viewports < 640px once the matchMedia listener attaches.
  const [side, setSide] = useState<"bottom" | "right">("right");
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mm = window.matchMedia("(min-width: 640px)");
    const update = () => setSide(mm.matches ? "right" : "bottom");
    update();
    // addEventListener is supported in all modern browsers; Safari ≤ 13 used
    // the deprecated addListener API but Phase 1 baseline is evergreen browsers.
    mm.addEventListener("change", update);
    return () => mm.removeEventListener("change", update);
  }, []);

  function close() {
    setErrorMsg(null);
    setFieldErrors({});
    if (mode === "edit") {
      void setEditar(null);
    } else {
      void setNuevo(null);
    }
  }

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    setFieldErrors({});

    let result: AddTransactionResult | EditTransactionResult;
    if (mode === "edit" && editar) {
      result = await editTransaction(editar, formData);
    } else {
      result = await addTransaction(formData);
    }

    if (result.ok) {
      toast.success(mode === "edit" ? "Cambios guardados" : "Transacción añadida");
      close();
      return;
    }

    switch (result.kind) {
      case "validation":
        setFieldErrors(result.fieldErrors);
        setErrorMsg("Revisa los campos marcados.");
        break;
      case "duplicate":
        setErrorMsg(
          "Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?",
        );
        break;
      case "not_found":
        setErrorMsg("La transacción no existe o ha sido borrada.");
        break;
      case "server_error":
      default:
        setErrorMsg("No se ha podido guardar. Reintenta.");
        break;
    }
  }

  // Initial values — prefill from editTarget when in edit mode, otherwise the
  // add-mode defaults (today's date + last-used or fallback category).
  const initialAmount =
    mode === "edit" && editTarget ? centsToInputString(editTarget.amountCents) : "";
  const initialDate =
    mode === "edit" && editTarget ? editTarget.bookingDate : todayISO();
  const initialDescription =
    mode === "edit" && editTarget ? editTarget.descriptionRaw : "";
  const initialCategory =
    mode === "edit" && editTarget
      ? editTarget.categoryId
      : (defaultCategoryId ?? undefined);

  return (
    <Sheet open={isOpen} onOpenChange={(open: boolean) => !open && close()}>
      <SheetContent side={side} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {mode === "edit" ? "Editar transacción" : "Añadir transacción"}
          </SheetTitle>
          <SheetDescription>
            Completa los 4 campos. El signo (ingreso o gasto) lo determina la categoría.
          </SheetDescription>
        </SheetHeader>

        <form
          action={onSubmit}
          id={formId}
          // The form is the scrollable middle region; SheetFooter pins the
          // action buttons to the bottom on both mobile and desktop.
          className="flex flex-1 flex-col gap-4 overflow-auto p-4"
        >
          {/* Field 1 — Importe (D-24, MAN-02) */}
          <div className="space-y-2">
            <Label htmlFor={`${formId}-amount`}>Importe</Label>
            <Input
              id={`${formId}-amount`}
              name="amount"
              inputMode="decimal"
              autoFocus
              required
              defaultValue={initialAmount}
              placeholder="0,00 €"
              aria-label="Importe"
              maxLength={20}
            />
            {fieldErrors.amount?.[0] ? (
              <p role="alert" className="text-sm text-red-600">
                {fieldErrors.amount[0]}
              </p>
            ) : null}
          </div>

          {/* Field 2 — Fecha (D-24) */}
          <div className="space-y-2">
            <Label htmlFor={`${formId}-date`}>Fecha</Label>
            <Input
              id={`${formId}-date`}
              name="booking_date"
              type="date"
              required
              defaultValue={initialDate}
              aria-label="Fecha"
            />
            {fieldErrors.booking_date?.[0] ? (
              <p role="alert" className="text-sm text-red-600">
                {fieldErrors.booking_date[0]}
              </p>
            ) : null}
          </div>

          {/* Field 3 — Descripción (D-24, T-02-19 maxlength) */}
          <div className="space-y-2">
            <Label htmlFor={`${formId}-description`}>Descripción</Label>
            <Input
              id={`${formId}-description`}
              name="description"
              maxLength={200}
              required
              defaultValue={initialDescription}
              placeholder="Ej: Café del trabajo"
              aria-label="Descripción"
            />
            {fieldErrors.description?.[0] ? (
              <p role="alert" className="text-sm text-red-600">
                {fieldErrors.description[0]}
              </p>
            ) : null}
          </div>

          {/* Field 4 — Categoría (D-24, kind-grouped) */}
          <div className="space-y-2">
            <Label htmlFor={`${formId}-category`}>Categoría</Label>
            <CategorySelect
              categories={categories}
              defaultValue={initialCategory}
              name="category_id"
              ariaLabel="Categoría"
              required
            />
            {fieldErrors.category_id?.[0] ? (
              <p role="alert" className="text-sm text-red-600">
                {fieldErrors.category_id[0]}
              </p>
            ) : null}
          </div>

          {errorMsg ? (
            <p role="alert" className="text-sm text-red-600">
              {errorMsg}
            </p>
          ) : null}
        </form>

        <SheetFooter className="flex-row gap-2 border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            className="flex-1"
          >
            Cancelar
          </Button>
          {/*
            The submit button lives outside the <form> DOM tree (Sheet renders
            footer as a sibling), so we associate it explicitly via `form={formId}`
            so React 19 form actions still fire useFormStatus().pending and
            invoke onSubmit() correctly.
          */}
          <SubmitButtonForForm mode={mode} formId={formId} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Submit button that targets the form by `id` (D-23 footer-outside-form layout).
 *
 * The shadcn SheetFooter renders as a sibling of the <form>, not inside it, so a
 * plain <button type="submit"> inside SheetFooter would not submit the form via
 * native HTML semantics. The `form` HTML attribute attaches the button to a form
 * by id, which is what we need here.
 *
 * useFormStatus() picks up the pending state because React 19 reads the
 * surrounding form's action state via React tree context — not the DOM tree —
 * so even though the button is outside the <form> element, the hook still works
 * provided the button is rendered inside the same React subtree as the <form>.
 */
function SubmitButtonForForm({
  mode,
  formId,
}: {
  mode: "add" | "edit";
  formId: string;
}) {
  const { pending } = useFormStatus();
  if (mode === "edit") {
    return (
      <Button
        type="submit"
        form={formId}
        disabled={pending}
        className="flex-1"
      >
        {pending ? "Guardando..." : "Guardar cambios"}
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      form={formId}
      disabled={pending}
      className="flex-1"
    >
      {pending ? "Añadiendo..." : "Añadir transacción"}
    </Button>
  );
}
