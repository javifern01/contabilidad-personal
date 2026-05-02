'use client';

/**
 * Route-level error boundary for /transacciones (LIST-05 / D-28).
 *
 * Catches unhandled errors thrown during the RSC render of page.tsx (e.g. DB
 * connection failures, getTransactionsList exceptions). Renders the verbatim
 * Spanish copy from CONTEXT specifics so empty/loading/error coverage is
 * complete (ROADMAP Phase 2 success criterion 5).
 *
 * Why a route-specific error.tsx (vs relying on app/error.tsx):
 * - LIST-05 specifies a verbatim copy ("No se han podido cargar las
 *   transacciones. Reintenta.") that differs from app/error.tsx's generic
 *   "Algo ha ido mal." Next.js prefers the most-specific error.tsx so this
 *   file overrides the global boundary for /transacciones errors only.
 * - The "Reintentar" button (vs the global "Volver a intentarlo") is the
 *   LIST-05 verbatim button copy.
 *
 * Logging discipline (T-02-26 mitigation): log only `error.digest` — Next.js
 * generates the digest server-side and surfaces it on the client. We never
 * log the underlying error string from the client boundary because it can
 * carry user input (description_raw substrings, IBAN-like merchant names)
 * or stack traces with PII. The digest is the stable correlation handle to
 * the server log; full details remain server-side.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function TransaccionesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the digest. Never the error string — may contain user input/PII.
    logger.error({ digest: error.digest }, 'transactions.error');
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold">
          No se han podido cargar las transacciones. Reintenta.
        </h2>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Referencia: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-6">
          <Button onClick={() => reset()}>Reintentar</Button>
        </div>
      </div>
    </main>
  );
}
