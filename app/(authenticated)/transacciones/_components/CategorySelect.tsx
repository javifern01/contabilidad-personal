"use client";

/**
 * CategorySelect — kind-grouped Select wired to the shadcn (base-ui) Select primitive.
 *
 * Implements D-24 (4th field of the Quick-Add form): renders three groups
 *   "Gastos"      → kind === 'expense'
 *   "Ingresos"    → kind === 'income'
 *   "Movimientos" → kind === 'transfer'
 * in that fixed order. Categories within each group are sorted by `sortOrder`
 * then alphabetically (Spanish collation) for deterministic UX.
 *
 * Form-data binding:
 *   The underlying base-ui Select.Root accepts a `name` prop and renders a
 *   hidden <input> internally (see node_modules/@base-ui/react/select/root/SelectRoot.d.ts
 *   `inputRef` prop), so a parent `<form action={onSubmit}>` will pick up the
 *   selected value via FormData.get(name). No manual hidden input is required.
 *
 * Reuse:
 *   The component is intentionally extracted from QuickAddSheet so Phase 3
 *   override flows (CAT-05/06) can reuse the same kind-grouped Select without
 *   pulling in the entire Sheet form.
 */

import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/drizzle/schema";

export interface CategorySelectProps {
  /** Full category list (typically fetched in an RSC parent and passed down). */
  categories: Category[];
  /** Initial value for uncontrolled mode. */
  defaultValue?: string;
  /** FormData field name. Defaults to "category_id" to match the addTransaction Zod schema. */
  name?: string;
  /** Whether the user must pick a value before submitting. Default true. */
  required?: boolean;
  /** Accessible label for the trigger. Default "Categoría". */
  ariaLabel?: string;
  /** Controlled value (optional). Pair with onValueChange. */
  value?: string;
  /** Controlled change handler (optional). */
  onValueChange?: (v: string) => void;
}

const GROUP_LABELS: Record<Category["kind"], string> = {
  expense: "Gastos",
  income: "Ingresos",
  transfer: "Movimientos",
};

const GROUP_ORDER: Category["kind"][] = ["expense", "income", "transfer"];

export function CategorySelect({
  categories,
  defaultValue,
  name = "category_id",
  required = true,
  ariaLabel = "Categoría",
  value,
  onValueChange,
}: CategorySelectProps) {
  const id = useId();

  // Group + sort. Empty groups are dropped so we never render an empty <SelectGroup>.
  const grouped = GROUP_ORDER.map((kind) => ({
    kind,
    label: GROUP_LABELS[kind],
    items: categories
      .filter((c) => c.kind === kind)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es-ES"),
      ),
  })).filter((g) => g.items.length > 0);

  return (
    <Select<string, false>
      defaultValue={defaultValue}
      value={value}
      onValueChange={(next) => {
        // base-ui's onValueChange may pass null when cleared in multi-select; in
        // single-select mode it always passes the chosen string. Guard for safety.
        if (typeof next === "string") onValueChange?.(next);
      }}
      name={name}
      required={required}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder="Selecciona una categoría" />
      </SelectTrigger>
      <SelectContent>
        {grouped.map((group) => (
          <SelectGroup key={group.kind}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
