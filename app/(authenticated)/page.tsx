/**
 * Authenticated landing page — resolves the "/" route for authenticated users.
 *
 * Phase 1 stub: confirms the session works end-to-end.
 * Phase 2 replaces this with the financial dashboard.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Inicio — Contabilidad Personal",
};

export default async function AuthenticatedHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  const name = session?.user.name ?? session?.user.email ?? "";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">
        Bienvenido{name ? `, ${name}` : ""}.
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Has iniciado sesión correctamente. La aplicación está en construcción — el panel
        de control llegará en la Fase 2.
      </p>
    </div>
  );
}
