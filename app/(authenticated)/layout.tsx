/**
 * Authenticated shell layout (D-07 + D-43).
 *
 * Server Component — uses auth.api.getSession for DB-backed session check (D-06).
 * Redirects to /login if no session (defense-in-depth; middleware also enforces this).
 *
 * Phase 2 (D-43): adds top nav (Resumen / Transacciones), persistent "+ Añadir"
 * header button on desktop, and a fixed-bottom 3-tab nav on mobile. Phase 1
 * UserMenu remains on the right of the header. All Phase 1 contracts preserved:
 * brand div, session gate, UserMenu props.
 *
 * All pages inside `(authenticated)/` inherit this shell automatically.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/user-menu";
import { TopNav } from "./_components/TopNav";
import { AddFab } from "./_components/AddFab";
import { MobileBottomNav } from "./_components/MobileBottomNav";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="font-semibold text-sm">Contabilidad Personal</div>
        <div className="hidden flex-1 items-center justify-center sm:flex">
          <TopNav />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <AddFab variant="header" />
          </div>
          <UserMenu
            user={{
              name: session.user.name ?? "",
              email: session.user.email,
              image: session.user.image,
            }}
          />
        </div>
      </header>
      <main className="flex-1 pb-16 sm:pb-0">{children}</main>
      <MobileBottomNav />
    </div>
  );
}
