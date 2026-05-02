"use client";

/**
 * MoMDelta — Month-over-month delta badge (D-33).
 *
 * Renders an arrow + 1-decimal Spanish percentage, with direction-aware color:
 *   kind='positive-good' (Ingresos / Neto): up = emerald, down = rose
 *   kind='negative-good' (Gastos):           up = rose,    down = emerald
 *   kind='symmetric':                         neutral grey
 *
 * Empty / flat states (D-33 + CONTEXT specifics):
 *   delta === null → "Sin datos del mes anterior" (slate, no arrow)
 *   delta === 0    → "0,0 %" (slate, no arrow)
 */

export type MoMKind = "positive-good" | "negative-good" | "symmetric";

export interface MoMDeltaProps {
  /** Percentage points; null → no prior data; 0 → flat. */
  delta: number | null;
  kind: MoMKind;
}

const pctFormatter = new Intl.NumberFormat("es-ES", {
  style: "decimal",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function MoMDelta({ delta, kind }: MoMDeltaProps) {
  if (delta === null) {
    return (
      <span className="text-xs text-slate-500">Sin datos del mes anterior</span>
    );
  }

  if (delta === 0) {
    return <span className="text-xs text-slate-500">0,0 %</span>;
  }

  const isUp = delta > 0;
  const arrow = isUp ? "↑" : "↓";
  const absStr = pctFormatter.format(Math.abs(delta));

  // Direction-aware color decision (D-33).
  let color: string;
  if (kind === "symmetric") {
    color = "text-slate-500";
  } else if (kind === "positive-good") {
    color = isUp ? "text-emerald-600" : "text-rose-600";
  } else {
    // negative-good: e.g. Gastos → up is bad
    color = isUp ? "text-rose-600" : "text-emerald-600";
  }

  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {absStr} %
    </span>
  );
}
