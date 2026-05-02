"use client";

/**
 * Filters — URL-bound filter bar for /transacciones (D-28 / LIST-03).
 *
 * URL state via nuqs (D-28 — URL is the single source of truth so filters survive
 * reload, deep-linking, the AddFab navigation, and Plan 09 E2E URL assertions):
 *   q       string         — ILIKE on description_raw (capped at 200 chars upstream)
 *   min     string         — amount lower bound (Spanish/English decimals)
 *   max     string         — amount upper bound
 *   desde   string         — YYYY-MM-DD; bookingDate >=
 *   hasta   string         — YYYY-MM-DD; bookingDate <=
 *   cat     string[]       — multi-select category ids; serialized comma-separated
 *                             (e.g. cat=uuid1,uuid2,uuid3) per D-28 / LIST-03
 *   pag     string         — page number (1-indexed); reset to null whenever a
 *                             filter changes so the user does not land on a
 *                             non-existent page after narrowing the result set.
 *
 * Multi-select category UX (D-28 / LIST-03):
 *   A Popover trigger labeled "Categorías ({n})" opens a list of Checkbox rows
 *   grouped by Category.kind ("Gastos" / "Ingresos" / "Movimientos"). Toggling
 *   writes the cat array via parseAsArrayOf(parseAsString) — Plan 04
 *   getTransactionsList already accepts `cat?: string[]` and binds it to a
 *   parameterized inArray() (T-02-22 / T-02-16 mitigation), so no backend change
 *   is needed.
 *
 * Performance: every URL write is wrapped in startTransition so the page RSC
 * re-fetch happens off the input thread; typing in the search box stays smooth.
 */

import { useQueryState, parseAsArrayOf, parseAsString } from "nuqs";
import { useTransition, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { Category } from "@/drizzle/schema";

export interface FiltersProps {
  categories: Category[];
}

const KIND_LABEL: Record<Category["kind"], string> = {
  expense: "Gastos",
  income: "Ingresos",
  transfer: "Movimientos",
};

export function Filters({ categories }: FiltersProps) {
  const [q, setQ] = useQueryState("q");
  const [min, setMin] = useQueryState("min");
  const [max, setMax] = useQueryState("max");
  const [desde, setDesde] = useQueryState("desde");
  const [hasta, setHasta] = useQueryState("hasta");
  const [cats, setCats] = useQueryState(
    "cat",
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [, setPag] = useQueryState("pag");
  const [, startTransition] = useTransition();

  function setFilter(setter: (v: string | null) => void, value: string) {
    startTransition(() => {
      void setter(value === "" ? null : value);
      void setPag(null);
    });
  }

  function toggleCategory(id: string, checked: boolean) {
    startTransition(() => {
      const next = checked ? [...cats, id] : cats.filter((c) => c !== id);
      void setCats(next.length === 0 ? null : next);
      void setPag(null);
    });
  }

  function clearAll() {
    startTransition(() => {
      void setQ(null);
      void setMin(null);
      void setMax(null);
      void setDesde(null);
      void setHasta(null);
      void setCats(null);
      void setPag(null);
    });
  }

  const hasAny = !!(q || min || max || desde || hasta || cats.length > 0);
  const selectedCount = cats.length;

  // Pre-grouped option lists — kind order is fixed (Gastos → Ingresos → Movimientos)
  // to match the QuickAddSheet CategorySelect grouping for visual consistency.
  const grouped = (["expense", "income", "transfer"] as const).map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: categories.filter((c) => c.kind === kind),
  }));

  return (
    <div className="grid grid-cols-1 gap-3 border-b p-4 sm:grid-cols-3 lg:grid-cols-6">
      <div>
        <Label htmlFor="filter-q">Buscar</Label>
        <Input
          id="filter-q"
          placeholder="Descripción..."
          defaultValue={q ?? ""}
          maxLength={200}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(setQ, e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="filter-desde">Desde</Label>
        <Input
          id="filter-desde"
          type="date"
          defaultValue={desde ?? ""}
          onChange={(e) => setFilter(setDesde, e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="filter-hasta">Hasta</Label>
        <Input
          id="filter-hasta"
          type="date"
          defaultValue={hasta ?? ""}
          onChange={(e) => setFilter(setHasta, e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="filter-min">Importe mínimo (€)</Label>
        <Input
          id="filter-min"
          inputMode="decimal"
          defaultValue={min ?? ""}
          placeholder="0,00"
          onChange={(e) => setFilter(setMin, e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="filter-max">Importe máximo (€)</Label>
        <Input
          id="filter-max"
          inputMode="decimal"
          defaultValue={max ?? ""}
          placeholder="9999,99"
          onChange={(e) => setFilter(setMax, e.target.value)}
        />
      </div>

      {/* Multi-select category Popover (LIST-03 / D-28) */}
      <div>
        <Label htmlFor="filter-cat-trigger">Categorías</Label>
        <Popover>
          <PopoverTrigger
            render={(props) => (
              <Button
                {...props}
                id="filter-cat-trigger"
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-haspopup="dialog"
              >
                <span>Categorías ({selectedCount})</span>
                <span aria-hidden="true">▾</span>
              </Button>
            )}
          />
          <PopoverContent align="start" className="w-72 p-0">
            <div className="max-h-80 overflow-y-auto p-2">
              {grouped.map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.kind} className="mb-2">
                    <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                      {group.label}
                    </div>
                    {group.items.map((cat) => {
                      const checked = cats.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              toggleCategory(cat.id, v === true)
                            }
                            aria-label={cat.name}
                          />
                          <span>{cat.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ),
              )}
              {selectedCount > 0 ? (
                <div className="border-t pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      startTransition(() => {
                        void setCats(null);
                        void setPag(null);
                      });
                    }}
                  >
                    Limpiar categorías
                  </Button>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {hasAny ? (
        <div className="sm:col-span-3 lg:col-span-6">
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}
    </div>
  );
}
