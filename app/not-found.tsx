/**
 * 404 not-found page (FND-05).
 *
 * Displayed when no route matches the requested URL.
 * Spanish copy per project constraint (CLAUDE.md: Spanish only for UI).
 */

import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold">Página no encontrada.</h1>
        <p className="mt-2 text-sm text-gray-600">
          La dirección a la que has accedido no existe.
        </p>
        <div className="mt-6">
          <Link href="/" className="underline text-sm">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
