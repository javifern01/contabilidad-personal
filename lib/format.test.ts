import { describe, it, expect } from "vitest";
import {
  formatEur,
  parseEurInput,
  formatDateEs,
  formatDateShortEs,
  monthBoundaryMadrid,
} from "@/lib/format";

// Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }) uses U+00A0
// (non-breaking space, 0xa0) between the number and the € symbol.
const NBSP = " ";

describe("formatEur", () => {
  it("zero cents -> '0,00 €'", () => {
    expect(formatEur(0)).toBe(`0,00${NBSP}€`);
  });

  it("one cent -> '0,01 €'", () => {
    expect(formatEur(1)).toBe(`0,01${NBSP}€`);
  });

  it("100 cents (1 EUR) -> '1,00 €'", () => {
    expect(formatEur(100)).toBe(`1,00${NBSP}€`);
  });

  it("123456 cents -> '1.234,56 €'", () => {
    expect(formatEur(123456)).toBe(`1.234,56${NBSP}€`);
  });

  it("negative: -50000 cents -> '-500,00 €'", () => {
    expect(formatEur(-50000)).toBe(`-500,00${NBSP}€`);
  });

  it("zero as bigint -> '0,00 €'", () => {
    expect(formatEur(0n)).toBe(`0,00${NBSP}€`);
  });

  it("very large bigint: 99999999999n cents -> '999.999.999,99 €'", () => {
    expect(formatEur(99999999999n)).toBe(`999.999.999,99${NBSP}€`);
  });

  it("accepts number input", () => {
    expect(formatEur(50000)).toBe(`500,00${NBSP}€`);
  });

  it("accepts bigint input", () => {
    expect(formatEur(50000n)).toBe(`500,00${NBSP}€`);
  });

  it("negative bigint input", () => {
    expect(formatEur(-123456n)).toBe(`-1.234,56${NBSP}€`);
  });
});

describe("parseEurInput", () => {
  it("Spanish comma decimal: '1234,56' -> 123456n", () => {
    expect(parseEurInput("1234,56")).toBe(123456n);
  });

  it("Spanish thousands + comma decimal: '1.234,56' -> 123456n", () => {
    expect(parseEurInput("1.234,56")).toBe(123456n);
  });

  it("English point decimal (tolerated): '1234.56' -> 123456n", () => {
    expect(parseEurInput("1234.56")).toBe(123456n);
  });

  it("integer-only input: '1234' -> 123400n", () => {
    expect(parseEurInput("1234")).toBe(123400n);
  });

  it("Spanish thousands only: '1.234' -> 123400n (3 digits after dot = thousands)", () => {
    expect(parseEurInput("1.234")).toBe(123400n);
  });

  it("strips whitespace and EUR sign: '  1.234,56 €  ' -> 123456n", () => {
    expect(parseEurInput("  1.234,56 €  ")).toBe(123456n);
  });

  it("strips NBSP and EUR sign: '1.234,56\\u00a0€' -> 123456n", () => {
    expect(parseEurInput(`1.234,56${NBSP}€`)).toBe(123456n);
  });

  it("'1,234' with 3 digits after comma -> 123400n (thousands interpretation)", () => {
    // Ambiguity rule: if comma has exactly 3 digits after it and no other separator,
    // treat as thousands separator (Spanish "1.234" equivalently "1,234" is thousands).
    expect(parseEurInput("1,234")).toBe(123400n);
  });

  it("'0' -> 0n", () => {
    expect(parseEurInput("0")).toBe(0n);
  });

  it("'0,00' -> 0n", () => {
    expect(parseEurInput("0,00")).toBe(0n);
  });

  it("throws on empty input", () => {
    expect(() => parseEurInput("")).toThrow();
  });

  it("throws on whitespace-only input", () => {
    expect(() => parseEurInput("   ")).toThrow();
  });

  it("throws on non-numeric input: 'abc'", () => {
    expect(() => parseEurInput("abc")).toThrow();
  });

  it("throws on multiple commas: '1,2,3'", () => {
    expect(() => parseEurInput("1,2,3")).toThrow();
  });

  it("throws on ambiguous multiple dots: '1.2.3.4'", () => {
    expect(() => parseEurInput("1.2.3.4")).toThrow();
  });
});

describe("formatDateEs", () => {
  it("May 1 2026 -> '1 de mayo de 2026'", () => {
    expect(formatDateEs(new Date("2026-05-01T10:00:00Z"))).toBe(
      "1 de mayo de 2026",
    );
  });

  it("December 25 2026 -> '25 de diciembre de 2026'", () => {
    expect(formatDateEs(new Date("2026-12-25T12:00:00Z"))).toBe(
      "25 de diciembre de 2026",
    );
  });
});

describe("formatDateShortEs", () => {
  it("May 1 2026 -> '01/05/2026'", () => {
    expect(formatDateShortEs(new Date("2026-05-01T10:00:00Z"))).toBe(
      "01/05/2026",
    );
  });

  it("December 25 2026 -> '25/12/2026'", () => {
    expect(formatDateShortEs(new Date("2026-12-25T12:00:00Z"))).toBe(
      "25/12/2026",
    );
  });
});

describe("monthBoundaryMadrid", () => {
  it("October 2026 — DST fall-back (CEST->CET) is inside this month", () => {
    // 2026-10-25 03:00 CEST -> CET fall-back occurs inside October.
    // Oct 1 00:00 Madrid (CEST UTC+2) = Sep 30 22:00 UTC
    // Nov 1 00:00 Madrid (CET UTC+1)  = Oct 31 23:00 UTC
    const { start, end } = monthBoundaryMadrid(
      new Date("2026-10-15T12:00:00Z"),
    );
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("March 2026 — DST spring-forward (CET->CEST) is inside this month", () => {
    // 2026-03-29 02:00 CET -> CEST spring-forward occurs inside March.
    // Mar 1 00:00 Madrid (CET UTC+1)   = Feb 28 23:00 UTC
    // Apr 1 00:00 Madrid (CEST UTC+2)  = Mar 31 22:00 UTC
    const { start, end } = monthBoundaryMadrid(
      new Date("2026-03-15T12:00:00Z"),
    );
    expect(start.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  it("July 2026 — fully CEST (UTC+2, no DST transition)", () => {
    // Jul 1 00:00 Madrid (CEST UTC+2) = Jun 30 22:00 UTC
    // Aug 1 00:00 Madrid (CEST UTC+2) = Jul 31 22:00 UTC
    const { start, end } = monthBoundaryMadrid(
      new Date("2026-07-15T12:00:00Z"),
    );
    expect(start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });

  it("January 2026 — fully CET (UTC+1, no DST transition)", () => {
    // Jan 1 00:00 Madrid (CET UTC+1) = Dec 31 2025 23:00 UTC
    // Feb 1 00:00 Madrid (CET UTC+1) = Jan 31 23:00 UTC
    const { start, end } = monthBoundaryMadrid(
      new Date("2026-01-15T12:00:00Z"),
    );
    expect(start.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-31T23:00:00.000Z");
  });

  it("at the DST fall-back instant — still returns October bounds, not November", () => {
    // 2026-10-25 01:00 UTC = 03:00 CEST (exact moment DST ends in Madrid)
    const { start, end } = monthBoundaryMadrid(
      new Date("2026-10-25T01:00:00Z"),
    );
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
