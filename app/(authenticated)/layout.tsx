/**
 * Authenticated shell layout (D-07).
 *
 * Server Component — uses auth.api.getSession for DB-backed session check (D-06).
 * Redirects to /login if no session (defense-in-depth; middleware also enforces this).
 *
 * All pages inside `(authenticated)/` inherit this shell automatically.
 * Phase 2+ pages are added here without re-building auth logic.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/user-menu";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="font-semibold text-sm">Contabilidad Personal</div>
        <UserMenu
          user={{
            name: session.user.name ?? "",
            email: session.user.email,
            image: session.user.image,
          }}
        />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
