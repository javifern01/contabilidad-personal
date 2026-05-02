/**
 * Unit tests for manual-transaction deduplication helpers (D-22).
 *
 * computeManualDedupKey is pure (no DB) — runs in CI without DATABASE_URL.
 *
 * The dedup_key formula (D-22):
 *   sha256(accountId | bookingDate(YYYY-MM-DD) | amountCents | normalize(description) | floor(anchorMs / 60_000))
 *
 * The minute-truncated anchor ensures genuinely-distinct entries (e.g. two coffees
 * entered ≥1 minute apart) get unique keys; double-clicks within 60s collide.
 */

import { describe, it, expect } from "vitest";
import { computeManualDedupKey, normalizeDescription } from "./dedup";

describe("normalizeDescription", () => {
  it("lowercases", () => {
    expect(normalizeDescription("MERCADONA")).toBe("mercadona");
  });

  it("collapses whitespace", () => {
    expect(normalizeDescription("  Café  del   Trabajo ")).toBe("cafe del trabajo");
  });

  it("strips diacritics", () => {
    expect(normalizeDescription("Año Nuevo Ñ")).toBe("ano nuevo n");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDescription("")).toBe("");
  });

  it("normalizes a Spanish merchant string with mixed case + accents", () => {
    expect(normalizeDescription("MERCADONA SANT JOAN")).toBe("mercadona sant joan");
  });
});

describe("computeManualDedupKey (D-22)", () => {
  const baseInput = {
    accountId: "00000000-0000-0000-0000-000000000001",
    bookingDate: new Date("2026-05-01"),
    amountCents: 1234n,
    description: "Café del trabajo",
    // anchorMs at exactly minute 12:00 UTC on 2026-05-01
    anchorMs: Date.UTC(2026, 4, 1, 12, 0, 30),
  };

  it("produces a 64-char lowercase hex string", () => {
    const key = computeManualDedupKey(baseInput);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for identical inputs", () => {
    expect(computeManualDedupKey(baseInput)).toBe(computeManualDedupKey(baseInput));
  });

  it("differs across distinct minutes (D-22 minute-truncation)", () => {
    const a = computeManualDedupKey(baseInput);
    const b = computeManualDedupKey({
      ...baseInput,
      anchorMs: Date.UTC(2026, 4, 1, 12, 1, 0), // next minute
    });
    expect(a).not.toBe(b);
  });

  it("matches across the same minute (D-22)", () => {
    const a = computeManualDedupKey(baseInput);
    const b = computeManualDedupKey({
      ...baseInput,
      anchorMs: Date.UTC(2026, 4, 1, 12, 0, 59), // last second of same minute
    });
    expect(a).toBe(b);
  });

  it("differs by accountId", () => {
    const other = { ...baseInput, accountId: "00000000-0000-0000-0000-000000000002" };
    expect(computeManualDedupKey(baseInput)).not.toBe(computeManualDedupKey(other));
  });

  it("differs by bookingDate", () => {
    const other = { ...baseInput, bookingDate: new Date("2026-05-02") };
    expect(computeManualDedupKey(baseInput)).not.toBe(computeManualDedupKey(other));
  });

  it("differs by amountCents", () => {
    const other = { ...baseInput, amountCents: 5678n };
    expect(computeManualDedupKey(baseInput)).not.toBe(computeManualDedupKey(other));
  });

  it("differs by description", () => {
    const other = { ...baseInput, description: "Cena del sábado" };
    expect(computeManualDedupKey(baseInput)).not.toBe(computeManualDedupKey(other));
  });

  it("treats different descriptions that normalize identically as equal", () => {
    // Normalization is part of the key; two strings that normalize to the same
    // value must produce the same key (subject to identical other inputs).
    const a = computeManualDedupKey({ ...baseInput, description: "  CAFÉ DEL TRABAJO  " });
    const b = computeManualDedupKey({ ...baseInput, description: "café del trabajo" });
    expect(a).toBe(b);
  });
});
