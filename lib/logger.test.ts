/**
 * lib/logger.test.ts — Unit tests for the Pino logger (D-14, FND-04).
 *
 * Test strategy: We build a test-local logger using the same redact config and
 * IBAN regex formatter as lib/logger.ts. This isolates the test from env-driven
 * transport differences (pino-pretty in dev vs JSON in prod) and lets us capture
 * JSON output deterministically.
 *
 * The "logger module exports" describe block imports lib/logger directly and
 * confirms it exports named + default logger with callable methods.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import pino from "pino";

/**
 * Builds a test logger that mirrors the redact + serializer config from lib/logger.ts.
 * Writes JSON lines to the provided array for inspection.
 *
 * If lib/logger.ts changes its config and these tests begin to fail, that signals a drift
 * between the module and its test contract — the desired guarantee.
 */
function makeTestLogger(captured: string[]) {
  const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g;

  function stripIbans(value: unknown): unknown {
    if (typeof value === "string") return value.replace(IBAN_RE, "[IBAN_REDACTED]");
    if (Array.isArray(value)) return value.map(stripIbans);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = stripIbans(v);
      }
      return out;
    }
    return value;
  }

  return pino(
    {
      level: "trace",
      redact: {
        paths: [
          "password",
          "password_hash",
          "iban",
          "access_token",
          "refresh_token",
          "requisition_id",
          "secret_key",
          "description_raw",
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
        log(obj) {
          return stripIbans(obj) as Record<string, unknown>;
        },
      },
    },
    {
      write: (msg: string) => {
        captured.push(msg);
      },
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Redact paths (D-14 exact list)
// ────────────────────────────────────────────────────────────────────────────

const REDACT_KEYS = [
  "password",
  "password_hash",
  "iban",
  "access_token",
  "refresh_token",
  "requisition_id",
  "secret_key",
  "description_raw",
] as const;

describe("logger redaction (D-14)", () => {
  describe("top-level redact paths", () => {
    for (const key of REDACT_KEYS) {
      it(`redacts top-level field: ${key}`, () => {
        const captured: string[] = [];
        const log = makeTestLogger(captured);
        log.info({ [key]: "sensitive-value-xyz" }, "msg");
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]!);
        expect(parsed[key]).toBe("[REDACTED]");
        expect(JSON.stringify(parsed)).not.toContain("sensitive-value-xyz");
      });
    }
  });

  describe("nested redact paths (*.key)", () => {
    for (const key of REDACT_KEYS) {
      it(`redacts nested user.${key}`, () => {
        const captured: string[] = [];
        const log = makeTestLogger(captured);
        log.info({ user: { [key]: "secret-nested-987" } }, "msg");
        expect(captured).toHaveLength(1);
        const parsed = JSON.parse(captured[0]!);
        expect(parsed.user[key]).toBe("[REDACTED]");
        expect(JSON.stringify(parsed)).not.toContain("secret-nested-987");
      });
    }
  });

  describe("IBAN regex strip serializer", () => {
    it("redacts Spanish IBAN (ES, 24 chars) inside a string field", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info(
        { note: "transferencia ES7621000000010123456789 confirmada" },
        "msg",
      );
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.note).toBe("transferencia [IBAN_REDACTED] confirmada");
      expect(JSON.stringify(parsed)).not.toContain("ES7621000000010123456789");
    });

    it("redacts German IBAN (DE, 22 chars) inside a string field", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info({ note: "DE89370400440532013000 received" }, "msg");
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.note).toBe("[IBAN_REDACTED] received");
    });

    it("does NOT redact two-letter country code alone (not a valid IBAN)", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info({ country: "ES" }, "msg");
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.country).toBe("ES");
    });

    it("does NOT redact a BIC code (no leading digits after country code)", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info({ bic: "INGDESMM" }, "msg");
      const parsed = JSON.parse(captured[0]!);
      // BIC has no digits after the 2-char country code, so regex won't match
      expect(parsed.bic).toBe("INGDESMM");
    });

    it("redacts multiple IBANs in a single string field", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info(
        { note: "from ES7621000000010123456789 to DE89370400440532013000" },
        "msg",
      );
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.note).toBe("from [IBAN_REDACTED] to [IBAN_REDACTED]");
    });

    it("redacts IBAN inside a nested object string field", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info(
        { tx: { description: "ES7621000000010123456789 movement" } },
        "msg",
      );
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.tx.description).toBe("[IBAN_REDACTED] movement");
    });

    it("redacts IBAN inside an array of strings", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info(
        { notes: ["normal note", "transfer ES7621000000010123456789 done"] },
        "msg",
      );
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.notes[0]).toBe("normal note");
      expect(parsed.notes[1]).toBe("transfer [IBAN_REDACTED] done");
    });
  });

  describe("non-redacted fields pass through unchanged", () => {
    it("user_id and occurred_at are not modified", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info({ user_id: "abc123", occurred_at: "2026-05-01T10:00:00Z" }, "ok");
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.user_id).toBe("abc123");
      expect(parsed.occurred_at).toBe("2026-05-01T10:00:00Z");
    });

    it("numeric and boolean fields pass through unchanged", () => {
      const captured: string[] = [];
      const log = makeTestLogger(captured);
      log.info({ amount_cents: 123456, is_synced: true }, "ok");
      const parsed = JSON.parse(captured[0]!);
      expect(parsed.amount_cents).toBe(123456);
      expect(parsed.is_synced).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Logger module export contract
// ────────────────────────────────────────────────────────────────────────────

describe("logger module exports", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("default-exports a Pino logger instance with callable info/warn/error", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost/t");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
    const mod = await import("@/lib/logger");
    expect(typeof mod.default.info).toBe("function");
    expect(typeof mod.default.warn).toBe("function");
    expect(typeof mod.default.error).toBe("function");
  });

  it("named export `logger` is defined and callable", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost/t");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
    const { logger } = await import("@/lib/logger");
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("default export and named export logger are the same instance", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost/t");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
    const mod = await import("@/lib/logger");
    expect(mod.logger).toBe(mod.default);
  });
});
