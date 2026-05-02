/**
 * Dashboard — post-login default view (D-31 .. D-36).
 *
 * Replaces the Phase 1 placeholder. Server Component fetches all aggregates in
 * parallel via lib/aggregates.ts (DASH-07 — no synchronous external API calls
 * in the request path) and passes data to Client chart wrappers (D-36 split).
 *
 * Route choice (D-31): replace `(authenticated)/page.tsx` directly. The user
 * identity / nav lives in `(authenticated)/layout.tsx` (Plan 02-08).
 *
 * URL state: ?mes=YYYY-MM (D-32). Default = current Madrid month.
 *
 * Threat model T-02-26: searchParams.mes is untrusted — validated against a
 * regex and clamped to a sane year range; invalid input falls back silently.
 */

import {
  getCategoryBreakdown,
  getMonthlyKpisWithDelta,
  getTrendSeries,
} from "@/lib/aggregates";
import { formatMonthEs } from "@/lib/format";
import { CategoryBarChart } from "./_components/CategoryBarChart";
import { KpiCards } from "./_components/KpiCards";
import { MonthlyTrendChart } from "./_components/MonthlyTrendChart";
import { MonthPicker } from "./_components/MonthPicker";

export const metadata = {
  title: "Resumen — Contabilidad Personal",
};

interface SearchParams {
  mes?: string;
}

interface MonthSelection {
  year: number;
  month: number;
  mesValue: string;
}

/**
 * Compute the current Madrid month using `Intl.DateTimeFormat` with the
 * Europe/Madrid timezone — the server clock may be UTC on Vercel, so naive
 * `new Date().getMonth()` could land in the wrong month at the day boundary.
 * Phase 7 UX-04 covers DST-edge snapshot tests.
 */
function currentMadridMonth(): MonthSelection {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = Number(
    parts.find((p) => p.type === "year")?.value ?? now.getFullYear(),
  );
  const month = Number(
    parts.find((p) => p.type === "month")?.value ?? now.getMonth() + 1,
  );
  return {
    year,
    month,
    mesValue: `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}`,
  };
}

/**
 * T-02-26: regex validate the URL `mes` value, clamp the year to a sane range,
 * and silently fall back to the current Madrid month on invalid input.
 */
function parseMes(mes: string | undefined): MonthSelection {
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return currentMadridMonth();
  }
  const [yStr, mStr] = mes.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 25 || year > thisYear + 1) {
    return currentMadridMonth();
  }
  return { year, month, mesValue: mes };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { year, month, mesValue } = parseMes(sp.mes);

  // DASH-07: dashboard reads only via lib/aggregates.ts (cached + DB);
  // no synchronous calls to anthropic.com or any PSD2 aggregator.
  const [kpis, breakdown, trend] = await Promise.all([
    getMonthlyKpisWithDelta({ year, month }),
    getCategoryBreakdown({ year, month }),
    getTrendSeries({ windowMonths: 12 }),
  ]);

  // D-35 empty-state precondition: count months with ANY transaction
  // (income or expense). Computed server-side so the chart component
  // stays a thin Recharts wrapper.
  const monthsWithData = trend.filter(
    (r) => r.income_cents > 0n || r.expense_cents > 0n,
  ).length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-xl font-semibold">
          Resumen — {formatMonthEs(year, month)}
        </h1>
        <MonthPicker defaultValue={mesValue} />
      </header>

      <KpiCards data={kpis} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Gastos por categoría
        </h2>
        <CategoryBarChart data={breakdown} month={mesValue} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tendencia (últimos 12 meses)
        </h2>
        <MonthlyTrendChart data={trend} monthsWithData={monthsWithData} />
      </section>
    </div>
  );
}
