/**
 * KpiCards — Three KPI tiles: Ingresos / Gastos / Neto (D-31, D-33, DASH-01, DASH-03).
 *
 * - Server Component (no client directive) — pure props-in/JSX-out.
 * - Currency rendered via formatEur (DASH-05 + UX-03 + D-41).
 * - MoMDelta uses direction-aware kind:
 *     Ingresos → 'positive-good' (up = good, green)
 *     Gastos   → 'negative-good' (up = bad,  red)
 *     Neto     → 'positive-good'
 * - Internal-transfer rows are excluded by lib/aggregates.ts (D-40 / DASH-06)
 *   so this component does not need to filter them.
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEur } from "@/lib/format";
import type { MonthlyKpisWithDelta } from "@/lib/aggregates";
import { MoMDelta } from "./MoMDelta";

export interface KpiCardsProps {
  data: MonthlyKpisWithDelta;
}

export function KpiCards({ data }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ingresos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-semibold text-emerald-600">
            {formatEur(data.current.income_cents)}
          </div>
          <MoMDelta delta={data.delta_pct.income} kind="positive-good" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Gastos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-semibold text-rose-600">
            {formatEur(data.current.expense_cents)}
          </div>
          <MoMDelta delta={data.delta_pct.expense} kind="negative-good" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Neto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div
            className={`text-2xl font-semibold ${
              data.current.net_cents >= 0n
                ? "text-emerald-600"
                : "text-rose-600"
            }`}
          >
            {formatEur(data.current.net_cents)}
          </div>
          <MoMDelta delta={data.delta_pct.net} kind="positive-good" />
        </CardContent>
      </Card>
    </div>
  );
}
