/**
 * lib/logger.ts — Pino logger singleton with PII redaction (D-14, FND-04).
 *
 * Every server module imports `logger` from here. The eslint `no-console` rule
 * (set in plan 01-02) forbids `console.log` in production code, making this the
 * only sanctioned logging path.
 *
 * Redact config (D-14 exact list):
 *   Top-level: password, password_hash, iban, access_token, refresh_token,
 *              requisition_id, secret_key, description_raw
 *   Nested:    *.password, *.password_hash, *.iban, *.access_token, *.refresh_token,
 *              *.requisition_id, *.secret_key, *.description_raw
 *   Censor:    "[REDACTED]"
 *
 * IBAN regex strip: The `formatters.log` hook walks every string value in the log
 * object and replaces IBAN-pattern strings (/\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g)
 * with "[IBAN_REDACTED]". This covers fields not in the static redact paths
 * (e.g., free-text `note` or `description` fields containing an IBAN).
 *
 * Output:
 *   NODE_ENV=production -> JSON (Vercel log-drain friendly)
 *   NODE_ENV=development/test -> pino-pretty (human-readable, colorized)
 *
 * Note: lib/logger MUST NOT import from lib/env at module load time to avoid
 * circular dependencies (lib/env writes errors to process.stderr directly, per D-14).
 * We read NODE_ENV from process.env directly here.
 */

import pino from "pino";

// IBAN regex pattern from D-14: ISO 3166-1 alpha-2 country code + 2 check digits + BBAN.
// Minimum real IBAN length is 15 chars (Norway); maximum is 34 chars.
// The pattern [A-Z0-9]{1,30} after the check digits covers the BBAN segment.
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g;

/**
 * Recursively replaces IBAN-pattern strings in any log object value.
 * Applied after Pino's static redact pass, covering free-text string fields.
 */
function stripIbans(value: unknown): unknown {
  if (typeof value === "string") {
    // Reset lastIndex since IBAN_RE is global (reused across calls).
    IBAN_RE.lastIndex = 0;
    return value.replace(IBAN_RE, "[IBAN_REDACTED]");
  }
  if (Array.isArray(value)) return value.map(stripIbans);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripIbans(v);
    }
    return out;
  }
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",

  redact: {
    paths: [
      // Top-level paths (D-14 exact list)
      "password",
      "password_hash",
      "iban",
      "access_token",
      "refresh_token",
      "requisition_id",
      "secret_key",
      "description_raw",
      // Nested paths — one level deep (covers e.g. user.password, tx.access_token)
      "*.password",
      "*.password_hash",
      "*.iban",
      "*.access_token",
      "*.refresh_token",
      "*.requisition_id",
      "*.secret_key",
      "*.description_raw",
    ],
    censor: "[REDACTED]",
  },

  formatters: {
    /**
     * Applied to every log record after static redact.
     * Strips IBAN-pattern strings from any remaining string fields.
     */
    log(obj) {
      return stripIbans(obj) as Record<string, unknown>;
    },
  },

  // Production: raw JSON for Vercel log-drain ingestion.
  // Dev/test: pino-pretty for human-readable output during development.
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
        },
      },
});

export default logger;
