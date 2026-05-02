"use client";

/**
 * MobileBottomNav — fixed-bottom 3-tab nav for mobile (D-43).
 *
 * Layout: [Resumen]  [+ Añadir (centre)]  [Transacciones]
 *
 * Hidden on desktop via `sm:hidden` on the outer <nav>. The parent layout
 * applies `pb-16 sm:pb-0` to <main> so content does not sit underneath this bar.
 *
 * Active link: foreground text. Inactive: muted-foreground. `aria-current="page"`
 * is set on the active link for screen-reader context.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddFab } from "./AddFab";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Resumen" },
  { href: "/transacciones", label: "Transacciones" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t bg-background/95 backdrop-blur sm:hidden"
    >
      {TABS.map((t, i) => {
        const isActive = pathname === t.href;
        const link = (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
              isActive ? "text-foreground" : "text-muted-foreground"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span aria-hidden="true" className="text-lg">
              ●
            </span>
            <span>{t.label}</span>
          </Link>
        );
        // Insert AddFab between Resumen (i=0) and Transacciones (i=1)
        if (i === 0) {
          return (
            <span
              key="resumen-and-fab"
              className="flex flex-1 items-stretch"
            >
              {link}
              <AddFab variant="mobile" />
            </span>
          );
        }
        return link;
      })}
    </nav>
  );
}
