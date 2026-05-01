"use client";

/**
 * Global error boundary (FND-05).
 *
 * Catches errors that escape RootLayout itself (e.g., an error thrown during
 * font loading or root metadata resolution). Must include its own <html>+<body>
 * since the RootLayout has thrown and is unavailable.
 *
 * Spanish copy per project constraint (CLAUDE.md: Spanish only for UI).
 * Uses plain HTML elements — no shadcn Button since Tailwind may not have loaded.
 */

export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="es-ES">
      <body className="antialiased">
        <main className="flex min-h-screen items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold">Error inesperado.</h1>
            <p className="mt-2 text-sm text-gray-600">
              La aplicación no ha podido inicializarse. Intenta refrescar la página.
            </p>
            <div className="mt-6">
              <button
                onClick={() => reset()}
                className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Refrescar
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
