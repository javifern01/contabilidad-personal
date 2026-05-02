"use client";

/**
 * Pagination — page-based 50/page nav for /transacciones (D-28 / LIST-04).
 *
 * Reads `?pag=N` (1-indexed) from URL via nuqs and exposes Anterior / Siguiente
 * buttons that update the same URL key. Boundary state disables the buttons
 * (Anterior at page 1; Siguiente at last page). When `total === 0` the entire
 * nav is hidden — empty-state copy is rendered upstream by `TransactionList`.
 *
 * Spanish copy is verbatim from CONTEXT specifics:
 *   "Página X de Y · N transacciones" + "Anterior" / "Siguiente".
 *   Numbers use `toLocaleString('es-ES')` so "1.234 transacciones" renders
 *   with the Spanish thousands dot.
 */

import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function Pagination({ page, pageSize, total }: PaginationProps) {
  const [, setPag] = useQueryState("pag");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setPage(n: number) {
    if (n <= 1) {
      // Drop ?pag=1 from URL so the canonical first-page URL stays clean.
      void setPag(null);
    } else {
      void setPag(n.toString());
    }
  }

  if (total === 0) return null;

  return (
    <nav
      className="flex items-center justify-between gap-2 border-t px-4 py-3"
      aria-label="Paginación"
    >
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages} · {total.toLocaleString("es-ES")} transacciones
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
