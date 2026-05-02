"use client";

/**
 * AddFab — persistent "+ Añadir" trigger (D-43).
 *
 * Behavior:
 *   - On /transacciones: appends ?nuevo=1 while PRESERVING existing search params
 *     (q, pag, cat, min, max, desde, hasta, ...). Plan 09 E2E asserts this so that
 *     the user's filters survive the FAB tap mid-session.
 *   - On / or any other (authenticated) route: navigates to /transacciones?nuevo=1
 *     (no existing filters to preserve — fresh sheet).
 *
 * Variants:
 *   - "header" (default): standard shadcn Button with icon + label, used on desktop
 *     header.
 *   - "mobile": vertical icon + label tile, used as the centre item of the
 *     MobileBottomNav.
 *
 * Accessibility: aria-label "Añadir transacción" so screen readers announce the
 * action regardless of whether the icon is rendered.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AddFab({ variant = "header" }: { variant?: "header" | "mobile" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onClick() {
    if (pathname === "/transacciones") {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("nuevo", "1");
      router.push(`/transacciones?${sp.toString()}`);
    } else {
      router.push("/transacciones?nuevo=1");
    }
  }

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Añadir transacción"
        className="flex flex-col items-center justify-center gap-0.5 px-4 py-2 text-xs font-medium text-foreground"
      >
        <Plus aria-hidden="true" className="h-6 w-6" />
        <span>Añadir</span>
      </button>
    );
  }

  return (
    <Button type="button" onClick={onClick} aria-label="Añadir transacción">
      <Plus aria-hidden="true" className="mr-1 h-5 w-5" />
      Añadir
    </Button>
  );
}
