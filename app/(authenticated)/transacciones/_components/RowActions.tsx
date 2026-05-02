"use client";

/**
 * RowActions — per-row Edit + Borrar buttons (D-30, MAN-03, MAN-04).
 *
 * Edit:
 *   Sets `?editar={id}` on the URL via nuqs. The QuickAddSheet (Plan 02-05) is
 *   mounted on the page (Plan 02-06 page.tsx) and reacts to `?editar=` by
 *   opening in edit mode with the prefilled row.
 *
 * Borrar (soft-delete with Deshacer):
 *   Calls softDeleteTransaction; on success raises a sonner toast with
 *   "Transacción borrada" + "Deshacer" action button visible for 5 seconds
 *   (D-30). Clicking Deshacer calls restoreTransaction within the window.
 *   The toast itself dismisses after 5s; the row stays soft-deleted thereafter
 *   but is restorable from a future "Papelera" view (Phase 7 PRIV-04).
 *
 * Error handling:
 *   - softDelete / restore returns kind:'validation' → "Solicitud no válida."
 *     (WR-03: distinguishes a frontend bug passing the wrong identifier from
 *     a stale row that no longer exists.)
 *   - softDelete returns kind:'not_found'  → "No se ha podido borrar. Reintenta."
 *   - restore   returns kind:'not_found'   → "No se ha podido restaurar."
 *   - server_error                          → generic Spanish error copy.
 *   All surfaced as sonner error toasts (Spanish, peninsular tú-form).
 */

import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  softDeleteTransaction,
  restoreTransaction,
} from "@/app/(authenticated)/actions/transactions";

export interface RowActionsProps {
  id: string;
}

export function RowActions({ id }: RowActionsProps) {
  const [, setEditar] = useQueryState("editar");

  function onEdit() {
    void setEditar(id);
  }

  async function onDelete() {
    const result = await softDeleteTransaction(id);
    if (!result.ok) {
      // WR-03: distinguish kind:"validation" (frontend wired the wrong id —
      // a real bug worth flagging differently) from kind:"not_found" (the
      // expected stale-row case after concurrent navigation).
      if (result.kind === "validation") {
        toast.error("Solicitud no válida.");
      } else {
        toast.error("No se ha podido borrar. Reintenta.");
      }
      return;
    }
    toast("Transacción borrada", {
      description: null,
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: async () => {
          const r = await restoreTransaction(id);
          if (r.ok) {
            toast.success("Transacción restaurada");
          } else if (r.kind === "validation") {
            toast.error("Solicitud no válida.");
          } else {
            toast.error("No se ha podido restaurar.");
          }
        },
      },
    });
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label="Editar">
        Editar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label="Borrar">
        Borrar
      </Button>
    </div>
  );
}
