/**
 * TransactionList — pure-presentational list table (RSC).
 *
 * No data fetch — the parent RSC (page.tsx) fetches via getTransactionsList
 * and passes data in. Renders a shadcn <Table> with one row per transaction:
 *   Fecha (DD/MM/YYYY via formatDateShortEs)
 *   Descripción + SourceBadge (D-29 'Manual' for source='manual')
 *   Categoría
 *   Importe (signed via category.kind, D-26 sign convention)
 *   Cuenta (placeholder dash at Phase 2 — only one account exists)
 *   Acciones (RowActions: Editar / Borrar)
 *
 * Empty / loading / error copy (D-28, LIST-05):
 *   no rows + no filters → "Aún no has añadido ninguna transacción."
 *   no rows + filters    → "No hay transacciones que coincidan con los filtros."
 *   error                → handled by app/(authenticated)/transacciones/error.tsx
 *
 * Sign convention (D-26): amount is rendered with a + or − prefix derived from
 * category.kind. Income → "+"; expense → "−" (U+2212 minus sign, not "-"); transfer
 * is internal — no sign is shown so the user does not double-count.
 *
 * Color tokens (CONTEXT specifics): emerald-600 for income, rose-600 for expense,
 * slate-600 for transfer. Same Tailwind tokens used on the dashboard MoMDelta /
 * trend chart so the visual language is consistent across the app.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur, formatDateShortEs } from "@/lib/format";
import { SourceBadge } from "./SourceBadge";
import { RowActions } from "./RowActions";
import type { TransactionListPage } from "@/lib/aggregates";

export interface TransactionListProps {
  page: TransactionListPage;
  hasFilters: boolean;
}

function signedAmount(
  cents: bigint,
  kind: "expense" | "income" | "transfer",
): string {
  if (kind === "income") return `+${formatEur(cents)}`;
  if (kind === "expense") return `−${formatEur(cents)}`;
  return formatEur(cents);
}

function amountClass(kind: "expense" | "income" | "transfer"): string {
  if (kind === "income") return "text-emerald-600 font-medium";
  if (kind === "expense") return "text-rose-600 font-medium";
  return "text-slate-600";
}

export function TransactionList({ page, hasFilters }: TransactionListProps) {
  if (page.rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-muted-foreground">
        {hasFilters
          ? "No hay transacciones que coincidan con los filtros."
          : "Aún no has añadido ninguna transacción."}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Fecha</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead className="hidden sm:table-cell">Categoría</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead className="hidden md:table-cell">Cuenta</TableHead>
          <TableHead className="w-32 text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-sm">
              {formatDateShortEs(r.bookingDate)}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="line-clamp-1">{r.descriptionRaw}</span>
                <SourceBadge source={r.source} />
              </div>
              {/* Mobile-only: surface the category here so users on small
                  viewports (where the Categoría column is hidden) still see it. */}
              <div className="text-xs text-muted-foreground sm:hidden">
                {r.categoryName}
              </div>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              {r.categoryName}
            </TableCell>
            <TableCell
              className={`text-right ${amountClass(r.categoryKind)}`}
            >
              {signedAmount(r.amountEurCents, r.categoryKind)}
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
              {/* Phase 2: only the seed 'Efectivo' account exists, so the column
                  exists for layout stability and to be filled by Phase 4 when
                  multiple PSD2-connected accounts are visible (account JOIN). */}
              —
            </TableCell>
            <TableCell className="text-right">
              <RowActions id={r.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
