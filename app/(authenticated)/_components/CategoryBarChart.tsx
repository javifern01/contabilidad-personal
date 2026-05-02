"use client";

/**
 * CategoryBarChart — Horizontal Recharts bar chart of expense-by-category (D-34).
 *
 * - Top 8 categories descending; rank 9+ collapsed into a single "Otros" bar.
 * - Click a bar → navigate to /transacciones?cat={category_id}&mes={month}
 *   ("Otros" bar is unclickable since it has no single category id).
 * - Excludes income / transfer kinds (income belongs in KPI cards; transfers
 *   are excluded from all dashboard widgets per D-40).
 * - Color tokens (CONTEXT specifics): rose-500 (#f43f5e) for category bars,
 *   slate-400 (#94a3b8) for the "Otros" rollup bar.
 * - Top-N rollup happens here, NOT in SQL — keeps `getCategoryBreakdown` a reusable
 *   primitive for the Phase 6 advisor.
 *
 * Server-fetched / Client-rendered split (D-36): page.tsx fetches via
 * lib/aggregates.ts in an RSC, then passes the rows as a prop to this Client
 * Component. Recharts ships only with this component, not the whole dashboard.
 */

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEur } from "@/lib/format";
import type { CategoryBreakdownRow } from "@/lib/aggregates";

const TOP_N = 8;

interface ChartRow {
  name: string;
  /** Number for Recharts (cannot serialize bigint). Source row is bigint cents. */
  total_cents: number;
  /** null for the "Otros" rollup row → bar is unclickable. */
  category_id: string | null;
}

function rollup(data: CategoryBreakdownRow[]): ChartRow[] {
  // D-34: only expenses on this chart. Income → KPI cards; transfers excluded by aggregates.
  const expenses = data
    .filter((r) => r.kind === "expense")
    .sort((a, b) => Number(b.total_cents) - Number(a.total_cents));

  if (expenses.length <= TOP_N) {
    return expenses.map((r) => ({
      name: r.name,
      total_cents: Number(r.total_cents),
      category_id: r.category_id,
    }));
  }

  const top = expenses.slice(0, TOP_N);
  const rest = expenses.slice(TOP_N);
  const otrosTotal = rest.reduce((acc, r) => acc + Number(r.total_cents), 0);

  return [
    ...top.map((r) => ({
      name: r.name,
      total_cents: Number(r.total_cents),
      category_id: r.category_id,
    })),
    { name: "Otros", total_cents: otrosTotal, category_id: null },
  ];
}

export interface CategoryBarChartProps {
  data: CategoryBreakdownRow[];
  /** YYYY-MM — appended to drill-down /transacciones link. */
  month: string;
}

export function CategoryBarChart({ data, month }: CategoryBarChartProps) {
  const router = useRouter();
  const rows = rollup(data);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Sin gastos en este mes.
      </div>
    );
  }

  const height = Math.max(220, rows.length * 36);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={rows}
        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
      >
        <XAxis
          type="number"
          tickFormatter={(n: number) =>
            // Strip ",00 €" suffix on whole-euro ticks for visual cleanliness.
            formatEur(n).replace(/[,.]00\s+€$/u, " €")
          }
        />
        <YAxis type="category" dataKey="name" width={120} />
        <Tooltip
          formatter={(value) => [
            formatEur(typeof value === "number" ? value : Number(value)),
            "Gasto",
          ]}
          labelFormatter={(label) => String(label)}
        />
        <Bar
          dataKey="total_cents"
          fill="#f43f5e"
          radius={[0, 4, 4, 0]}
          onClick={(payload) => {
            const row = payload as unknown as ChartRow;
            if (row?.category_id) {
              router.push(
                `/transacciones?cat=${encodeURIComponent(row.category_id)}&mes=${encodeURIComponent(month)}`,
              );
            }
          }}
          style={{ cursor: "pointer" }}
        >
          {rows.map((r) => (
            <Cell
              key={r.name}
              fill={r.category_id ? "#f43f5e" : "#94a3b8"}
              cursor={r.category_id ? "pointer" : "default"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
