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

function buildMonthOptions(): MonthOption[] {
  const today = new Date();
  const out: MonthOption[] = [];
  for (let i = 0; i < MONTHS_TO_SHOW; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
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
}

export function MonthPicker({ defaultValue }: MonthPickerProps) {
  const [mes, setMes] = useQueryState("mes");
  const value = mes ?? defaultValue;
  const options = buildMonthOptions();

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
