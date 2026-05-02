"use client";

/**
 * MonthPicker — Dashboard month selector (D-32).
 *
 * Last 24 months descending. Selecting a value writes ?mes=YYYY-MM via nuqs;
 * the dashboard RSC re-renders with the chosen month. Default = current Madrid
 * month (computed by the page RSC and passed as `defaultValue`).
 *
 * Spanish month labels come from formatMonthEs (D-41) — "Mayo 2026".
 */

import { useQueryState } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonthEs } from "@/lib/format";

const MONTHS_TO_SHOW = 24;

interface MonthOption {
  value: string;
  label: string;
}

/**
 * Build the descending 24-month label list anchored at `currentMonth`. We must
 * anchor on a value computed by the parent RSC (via `currentMadridMonth()` in
 * lib/format.ts) rather than `new Date().getMonth()` for two reasons:
 *
 *   1. Hydration safety (WR-08): this is a Client Component, but its initial
 *      render runs during SSR on a UTC server. `new Date().getMonth()` would
 *      produce different values on Node UTC and the user's Madrid browser at
 *      the day boundary, triggering a React hydration mismatch warning AND
 *      selecting the wrong default month for ~2 hours each summer day.
 *   2. Single source of truth: the dashboard already computes the Madrid
 *      anchor month for `?mes=` defaulting and the page header. Reusing that
 *      same anchor keeps the picker in sync with the rest of the dashboard.
 */
function buildMonthOptions(anchor: { year: number; month: number }): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < MONTHS_TO_SHOW; i++) {
    // Walk backwards from the anchor month, allowing negative month indices
    // — `new Date(year, monthIdx0 - i, 1)` correctly underflows the year when
    // monthIdx0 - i < 0, e.g. anchor=Jan 2026, i=2 → Nov 2025.
    const d = new Date(anchor.year, anchor.month - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const value = `${y.toString().padStart(4, "0")}-${m
      .toString()
      .padStart(2, "0")}`;
    out.push({ value, label: formatMonthEs(y, m) });
  }
  return out;
}

export interface MonthPickerProps {
  /** YYYY-MM — current Madrid month, computed server-side. */
  defaultValue: string;
  /**
   * Anchor month for the picker option list. Pass the same value the parent
   * RSC used to compute `defaultValue` (via `currentMadridMonth()` from
   * `lib/format.ts`) so the SSR markup and CSR hydration agree. WR-08.
   */
  currentMonth: { year: number; month: number };
}

export function MonthPicker({ defaultValue, currentMonth }: MonthPickerProps) {
  const [mes, setMes] = useQueryState("mes");
  const value = mes ?? defaultValue;
  const options = buildMonthOptions(currentMonth);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (typeof v === "string") {
          void setMes(v);
        }
      }}
    >
      <SelectTrigger className="w-48" aria-label="Mes">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
