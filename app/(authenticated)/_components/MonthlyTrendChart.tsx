"use client";

/**
 * MonthlyTrendChart — Recharts ComposedChart of cash-flow trend (D-35).
 *
 * Layout:
 *   - Stacked bars: income (emerald-500 #10b981) and expense_negative (rose-500 #f43f5e).
 *     Expense is plotted as a negative number so the red bar sits visually below zero.
 *   - Net line on top (blue-500 #3b82f6) — connects per-month net values.
 *   - 6–12 month adaptive window (the page picks `windowMonths`).
 *
 * Empty state (D-35): if fewer than 3 months contain ANY transaction (income
 * or expense), we render an empty-state card with the exact CONTEXT copy
 * "Añade transacciones durante al menos 3 meses para ver tu tendencia."
 *
 * Months with zero data still render as zero bars (D-35 — no skipping).
 *
 * Server-fetched / Client-rendered split (D-36): page.tsx fetches via
 * lib/aggregates.getTrendSeries in an RSC and passes data + monthsWithData
 * (precomputed server-side) as props.
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEur } from "@/lib/format";
import type { TrendSeriesRow } from "@/lib/aggregates";

const SHORT_MONTH_ES: Record<string, string> = {
  "01": "ene",
  "02": "feb",
  "03": "mar",
  "04": "abr",
  "05": "may",
  "06": "jun",
  "07": "jul",
  "08": "ago",
  "09": "sep",
  "10": "oct",
  "11": "nov",
  "12": "dic",
};

function tickLabel(monthStr: string): string {
  // monthStr is "YYYY-MM"; output "may 26".
  const [y, m] = monthStr.split("-");
  if (!y || !m) return monthStr;
  return `${SHORT_MONTH_ES[m] ?? m} ${y.slice(-2)}`;
}

const TOOLTIP_LABELS: Record<string, string> = {
  income: "Ingresos",
  expense_negative: "Gastos",
  net: "Neto",
};

export interface MonthlyTrendChartProps {
  data: TrendSeriesRow[];
  /** Count of months in `data` with at least one income or expense row. */
  monthsWithData: number;
}

export function MonthlyTrendChart({
  data,
  monthsWithData,
}: MonthlyTrendChartProps) {
  if (monthsWithData < 3) {
    return (
      <div className="rounded-xl border p-12 text-center text-sm text-muted-foreground">
        Añade transacciones durante al menos 3 meses para ver tu tendencia.
      </div>
    );
  }

  const chartData = data.map((r) => ({
    month: r.month,
    income: Number(r.income_cents),
    // Expense plotted negative so the red bar sits below zero in the stacked layout.
    expense_negative: -Number(r.expense_cents),
    net: Number(r.net_cents),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={tickLabel} />
        <YAxis
          tickFormatter={(n: number) =>
            formatEur(n).replace(/[,.]00\s+€$/u, " €")
          }
        />
        <Tooltip
          formatter={(value, name) => {
            const numeric = typeof value === "number" ? value : Number(value);
            const label = TOOLTIP_LABELS[String(name)] ?? String(name);
            return [formatEur(Math.abs(numeric)), label];
          }}
          labelFormatter={(label) => tickLabel(String(label))}
        />
        <Bar dataKey="income" stackId="cashflow" fill="#10b981" />
        <Bar dataKey="expense_negative" stackId="cashflow" fill="#f43f5e" />
        <Line
          type="monotone"
          dataKey="net"
          stroke="#3b82f6"
          strokeWidth={2}
          dot
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
