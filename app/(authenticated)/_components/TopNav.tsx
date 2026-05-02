"use client";

/**
 * TopNav — desktop top navigation for the (authenticated) shell (D-43).
 *
 * Two links (Resumen + Transacciones) with active-state highlighting based on the
 * current pathname. Hidden on mobile via the parent layout's `hidden sm:flex` wrapper —
 * mobile users get the same destinations via MobileBottomNav.
 *
 * Active link: bottom border + foreground text. Inactive: muted-foreground with a
 * hover transition to foreground. `aria-current="page"` is set on the active link
 * so screen readers announce the current location.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Resumen" },
  { href: "/transacciones", label: "Transacciones" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className="flex gap-1">
      {TABS.map((t) => {
        const isActive = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              isActive
                ? "rounded-md border-b-2 border-foreground px-3 py-1.5 text-sm font-medium"
                : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
