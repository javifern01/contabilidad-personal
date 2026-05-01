"use client";

/**
 * UserMenu — avatar dropdown in the authenticated top-bar (D-07).
 *
 * Phase 1: single item — "Cerrar sesión" (per D-07).
 * Phase 7+ will add "Exportar datos", "Cuenta", "Ajustes" items — leave room below the separator.
 *
 * Uses shadcn/ui DropdownMenu + Avatar primitives.
 * Logout is triggered via a <form action={logoutAction}> to ensure a proper POST
 * Server Action request — avoids GET semantics on sign-out.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { logoutAction } from "@/app/(authenticated)/actions/logout";

interface UserMenuUser {
  name: string;
  email: string;
  image?: string | null;
}

function initials(name: string, email: string): string {
  const base = name && name.trim().length > 0 ? name : email;
  const parts = base.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

export function UserMenu({ user }: { user: UserMenuUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menú de usuario"
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Avatar>
          {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
          <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name || "Propietario"}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Phase 1: only Cerrar sesión per D-07. Phase 7+ adds Exportar datos, Cuenta, Ajustes. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent focus:bg-accent focus:outline-none"
          >
            Cerrar sesión
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
