"use client";

/**
 * Route-level error boundary (FND-05, TS-14).
 *
 * Displayed when an unhandled error is thrown inside the render tree
 * within RootLayout (outside of global-error.tsx's scope).
 * Spanish copy per project constraint (CLAUDE.md: Spanish only for UI).
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side telemetry is already logged by the logger.
    // Phase 1: surface the digest for support reference only.
    // Phase 5+: send to observability API if needed.
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold">Algo ha ido mal.</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ha ocurrido un error inesperado. Vuelve a intentarlo o, si persiste, contacta
          con soporte.
        </p>
        {error.digest ? (
          <p className="mt-4 text-xs text-gray-500">
            Referencia: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-6">
          <Button onClick={() => reset()}>Volver a intentarlo</Button>
        </div>
      </div>
    </main>
  );
}
