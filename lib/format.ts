/**
 * lib/format.ts — Spanish-locale formatting helpers (D-11, FND-05, FND-06).
 *
 * Currency: Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
 *           Outputs '1.234,56 €' (U+00A0 non-breaking space before €).
 *           Stored amounts are bigint cents (FND-02); display divides by 100.
 *
 * Dates:    Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }) for "1 de mayo de 2026"
 *           Manual formatter via formatToParts for "01/05/2026" short form.
 *
 * Month boundaries: date-fns-tz fromZonedTime computes UTC instants for Madrid-local
 *                   month bounds, DST-correct.
 *
 * IMPORTANT: Never use floating-point arithmetic on cent amounts (FND-02 / PITFALLS.md).
 * formatEur divides by 100 only at display time. parseEurInput returns bigint cents
 * using string-based arithmetic to avoid 0.1 + 0.2 drift.
 */

import { fromZonedTime } from "date-fns-tz";

const TZ_MADRID = "Europe/Madrid";

const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateLongFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeZone: TZ_MADRID,
});

/**
 * Formats integer cents as Spanish-locale EUR string.
 * Accepts number or bigint cents.
 *
 * Examples:
 *   formatEur(0)          -> "0,00 €"
 *   formatEur(123456)     -> "1.234,56 €"
 *   formatEur(-50000)     -> "-500,00 €"
 *   formatEur(99999999999n) -> "999.999.999,99 €"
 */
export function formatEur(cents: bigint | number): string {
  const asNumber = typeof cents === "bigint" ? Number(cents) : cents;
  return eurFormatter.format(asNumber / 100);
}

/**
 * Parses a Spanish-locale (or English-tolerant) currency string into bigint cents.
 *
 * Accepted formats:
 *   "1234,56"       -> 123456n  (Spanish decimal comma)
 *   "1.234,56"      -> 123456n  (Spanish thousands dot + decimal comma)
 *   "1234.56"       -> 123456n  (English decimal dot — tolerated)
 *   "1234"          -> 123400n  (no decimals = whole euros)
 *   "1.234"         -> 123400n  (dot with 3 trailing digits = thousands separator)
 *   "1,234"         -> 123400n  (comma with 3 trailing digits = thousands separator)
 *   "  1.234,56 €  " -> 123456n  (whitespace + EUR sign stripped)
 *
 * Throws on: empty input, non-numeric, ambiguous multiple separators, > 2 decimal digits.
 *
 * Disambiguation rule for a single separator (dot or comma) with exactly 3 trailing digits:
 *   Always interpreted as a thousands separator (not decimal).
 *   Rationale: Spanish currency never uses 3 decimal places; and "1.234" is a common
 *   thousands-formatted integer.
 */
export function parseEurInput(value: string): bigint {
  // Strip whitespace (including NBSP) and EUR sign.
  const cleaned = value.replace(/[\s ]/g, "").replace(/€/g, "");
  if (cleaned.length === 0) throw new Error("parseEurInput: empty input");

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;

  if (lastDot === -1 && lastComma === -1) {
    // Pure integer: "1234"
    if (!/^-?\d+$/.test(cleaned)) {
      throw new Error(`parseEurInput: invalid number "${value}"`);
    }
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Comma is the rightmost separator — treat as decimal.
    // Dots (if any) to the left are thousands separators.
    const intRaw = cleaned.slice(0, lastComma);
    const fracPart = cleaned.slice(lastComma + 1);

    // Check for multiple commas (e.g., "1,2,3" -> second comma at idx 3, first at idx 1).
    // If there are commas to the left of lastComma, that is an error (only one comma allowed as decimal).
    const intRawHasComma = intRaw.includes(",");
    if (intRawHasComma) {
      throw new Error(`parseEurInput: multiple commas in "${value}"`);
    }

    const intPart = intRaw.replace(/\./g, ""); // strip thousands dots

    if (!/^-?\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) {
      throw new Error(`parseEurInput: invalid number "${value}"`);
    }
    if (fracPart.length > 2) {
      // Comma with exactly 3 trailing digits = thousands separator (e.g., "1,234").
      if (fracPart.length === 3 && lastDot === -1) {
        // "1,234" -> thousands interpretation
        normalized = intPart + fracPart;
      } else {
        throw new Error(
          `parseEurInput: too many decimal places in "${value}"`,
        );
      }
    } else {
      normalized = `${intPart}.${fracPart}`;
    }
  } else if (lastDot > lastComma) {
    // Dot is the rightmost separator.
    const afterDot = cleaned.slice(lastDot + 1);
    const beforeDot = cleaned.slice(0, lastDot);

    // Check for multiple dots after stripping (e.g., "1.2.3.4" would have multiple dots).
    const dotCount = (cleaned.match(/\./g) ?? []).length;

    if (afterDot.length === 3 && dotCount === 1 && lastComma === -1) {
      // "1.234" — single dot, exactly 3 trailing digits, no comma
      // -> Spanish thousands separator. Interpret as integer 1234.
      if (!/^\d+$/.test(beforeDot) || !/^\d+$/.test(afterDot)) {
        throw new Error(`parseEurInput: invalid number "${value}"`);
      }
      normalized = `${beforeDot}${afterDot}`;
    } else if (dotCount > 1) {
      // Multiple dots without a comma-decimal: check if valid thousands chain.
      // e.g., "1.234.567" is valid thousands; "1.2.3.4" is invalid.
      // Strategy: strip all dots and check if the resulting number has sense.
      // A valid Spanish thousands chain has groups of exactly 3 after the first group.
      // For simplicity and correctness, reject multiple dots without a comma-decimal.
      throw new Error(
        `parseEurInput: ambiguous multiple dots in "${value}" — use comma as decimal separator`,
      );
    } else {
      // Single dot with ≤ 2 trailing digits (or ≥ 4 trailing digits = decimal).
      // "1234.56" or "1.5" -> English decimal form.
      const intPart = beforeDot.replace(/,/g, ""); // strip any thousands commas
      if (!/^-?\d*$/.test(intPart) || !/^\d+$/.test(afterDot)) {
        throw new Error(`parseEurInput: invalid number "${value}"`);
      }
      if (afterDot.length > 2) {
        throw new Error(
          `parseEurInput: too many decimal places in "${value}"`,
        );
      }
      normalized = `${intPart}.${afterDot}`;
    }
  } else {
    // Both missing yet cleaned is non-empty — already handled by first branch.
    throw new Error(`parseEurInput: invalid number "${value}"`);
  }

  // Final numeric validation.
  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    throw new Error(`parseEurInput: invalid number "${value}"`);
  }

  // Convert to cents using string arithmetic to avoid float drift.
  const isNegative = normalized.startsWith("-");
  const absNormalized = isNegative ? normalized.slice(1) : normalized;
  const dotIdx = absNormalized.indexOf(".");
  let intStr: string;
  let fracStr: string;
  if (dotIdx === -1) {
    intStr = absNormalized;
    fracStr = "00";
  } else {
    intStr = absNormalized.slice(0, dotIdx);
    fracStr = (absNormalized.slice(dotIdx + 1) + "00").slice(0, 2);
  }

  const intCents = BigInt(intStr) * 100n + BigInt(fracStr);
  return isNegative ? -intCents : intCents;
}

/**
 * Formats a Date as Spanish long date string.
 * Example: new Date("2026-05-01T10:00:00Z") -> "1 de mayo de 2026"
 *
 * Uses Europe/Madrid timezone for display.
 */
export function formatDateEs(d: Date): string {
  return dateLongFormatter.format(d);
}

/**
 * Formats a Date as compact Spanish date string (DD/MM/YYYY).
 * Example: new Date("2026-05-01T10:00:00Z") -> "01/05/2026"
 *
 * Uses Europe/Madrid timezone for display.
 */
export function formatDateShortEs(d: Date): string {
  const parts = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ_MADRID,
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "??";
  const month = parts.find((p) => p.type === "month")?.value ?? "??";
  const year = parts.find((p) => p.type === "year")?.value ?? "????";
  return `${day}/${month}/${year}`;
}

/**
 * Format a calendar month in Spanish "Mayo 2026" form (D-41).
 *
 * @param year  Four-digit year (e.g. 2026)
 * @param month 1–12 (1 = January)
 * @returns Capitalized "Mayo 2026" — the lowercase ICU output is uppercased on
 *          the first character (CSS text-transform is unreliable for first-letter
 *          Unicode and Spanish month names are pure ASCII so .toUpperCase() is safe).
 *
 * Anchor strategy: use day=15, hour=12 UTC. Day 15 is mid-month so DST transitions
 * (last Sunday of March / October in Europe/Madrid) cannot push the date into a
 * neighboring month. Hour 12 UTC is 13:00 or 14:00 in Madrid — safely inside the day.
 *
 * `de` connector handling: ICU's `es-ES` long-month-+-year format outputs
 * "mayo de 2026" with a Spanish "de" connector. D-41 specifies "Mayo 2026"
 * (no connector). The `.replace(/\s+de\s+/, " ")` strip handles this. If a future
 * Node 20 ICU/CLDR drop emits a different form (e.g. just "mayo 2026"), the
 * replace is a no-op and the result is still correct.
 */
export function formatMonthEs(year: number, month: number): string {
  const anchor = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: TZ_MADRID,
  });
  const raw = formatter.format(anchor); // e.g. "mayo de 2026"
  const cleaned = raw.replace(/\s+de\s+/, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Returns the UTC Date instants bounding the calendar month that contains `d`
 * in the Europe/Madrid timezone. DST-correct: uses date-fns-tz fromZonedTime
 * to convert Madrid-local midnight to UTC, which respects IANA DST rules.
 *
 * Critical use case (D-11 golden fixture):
 *   Input:  2026-10-15T12:00:00Z  (October, month contains 2026-10-25 DST fall-back)
 *   Output: { start: 2026-09-30T22:00:00.000Z,  // Oct 1 00:00 Madrid (CEST UTC+2)
 *              end:   2026-10-31T23:00:00.000Z } // Nov 1 00:00 Madrid (CET UTC+1)
 *   Note: start and end have different UTC offsets because the month straddles the DST transition.
 *   Naive UTC arithmetic (+/- 2 hours) would produce wrong results.
 */
export function monthBoundaryMadrid(d: Date): { start: Date; end: Date } {
  // Determine the year and month in Madrid local time.
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: TZ_MADRID,
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value); // 1-12

  // Build ISO-format local date strings for the first day of this and next month.
  const startStr = `${year}-${String(month).padStart(2, "0")}-01T00:00:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`;

  // fromZonedTime converts a Madrid-local datetime to the correct UTC instant,
  // accounting for whether that local time is in CET (UTC+1) or CEST (UTC+2).
  const start = fromZonedTime(startStr, TZ_MADRID);
  const end = fromZonedTime(endStr, TZ_MADRID);

  return { start, end };
}
