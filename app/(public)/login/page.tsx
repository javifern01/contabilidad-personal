/**
 * Login page — Server Component.
 *
 * Checks for an existing session and redirects authenticated users to "/"
 * so they don't see the login form unnecessarily.
 * Passes the `next` search param to the form for post-login redirect.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Iniciar sesión — Contabilidad Personal",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (session) redirect("/");

  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm next={sp.next} />
    </main>
  );
}
