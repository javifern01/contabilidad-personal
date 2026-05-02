/**
 * Manual-transaction deduplication helpers (D-22).
 *
 * dedup_key formula:
 *   sha256(accountId | bookingDate(YYYY-MM-DD) | amountCents | normalize(description) | floor(anchorMs / 60_000))
 *
 * The minute-truncated anchor (`floor(anchorMs / 60_000)`) lets two genuinely-distinct
 * entries (e.g. "two coffees" entered ≥1 minute apart) coexist with unique keys, while
 * rejecting actual double-clicks within the same 60-second window via the unique index
 * `transactions_account_dedup_unique_idx ON (account_id, dedup_key)`.
 *
 * The Postgres unique-violation (SQLSTATE 23505) on this index is caught by
 * `app/(authenticated)/actions/transactions.ts addTransaction` and translated to
 * `{ ok: false, kind: "duplicate" }` so the form can show the Spanish copy
 * "Ya existe una transacción idéntica del último minuto. ¿Quizá fue un doble clic?".
 *
 * Threat-model note (T-02-10): the minute-bucket scheme limits the dedup-collision
 * surface so retry storms cannot brute-force a key — only true double-clicks within
 * 60s collide, and those are explicitly rejected.
 */

import { createHash } from "node:crypto";

/**
 * Normalize a free-text description for dedup-key computation:
 *   - Strip combining diacritics ("á" → "a", "ñ" → "n")
 *   - Lowercase
 *   - Collapse runs of whitespace into a single space
 *   - Trim leading/trailing whitespace
 *
 * Empty input returns "" (defensive — never throws).
 */
export function normalizeDescription(s: string): string {
  return s
    .normalize("NFD")
    // Strip Unicode combining marks (the diacritics left dangling after NFD).
    // The hex range ̀-ͯ covers the "Combining Diacritical Marks" block.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupKeyInput {
  /** Owning account UUID. */
  accountId: string;
  /** Calendar booking date (YYYY-MM-DD slice taken via toISOString). */
  bookingDate: Date;
  /** Always-positive integer cents per D-21 (sign derived from category at read time). */
  amountCents: bigint;
  /** Raw user-entered description; normalized internally before hashing. */
  description: string;
  /** Wall-clock timestamp (ms since epoch) at the moment of action invocation. */
  anchorMs: number;
}

/**
 * Compute the SHA-256 dedup key for a manual transaction (D-22).
 *
 * Returns a 64-character lowercase hex string.
 *
 * The pipe (`|`) separator between fields prevents adjacent-field collisions
 * (e.g., accountId="a", bookingDate="bcd" vs accountId="ab", bookingDate="cd").
 */
export function computeManualDedupKey(input: DedupKeyInput): string {
  const dateStr = input.bookingDate.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const minuteBucket = Math.floor(input.anchorMs / 60_000); // integer minute since epoch
  const payload = [
    input.accountId,
    dateStr,
    input.amountCents.toString(),
    normalizeDescription(input.description),
    minuteBucket.toString(),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
