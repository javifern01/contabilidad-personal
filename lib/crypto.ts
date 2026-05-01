/**
 * lib/crypto.ts — AES-256-GCM encryption helper.
 *
 * Output format (D-01):
 *   base64( iv[12 bytes] ‖ authTag[16 bytes] ‖ ciphertext[N bytes] )
 *
 * Binary layout of the base64-decoded blob:
 *   Bytes  0–11   : 12-byte random IV (generated fresh per encryptString call)
 *   Bytes 12–27   : 16-byte GCM authentication tag
 *   Bytes 28–(28+N): N-byte ciphertext (same length as UTF-8 plaintext)
 *
 * Used by Phase 4 (PSD2 token storage). Phase 1 ships and tests the API;
 * no encrypted columns in the schema yet (D-03).
 *
 * Key rotation (D-02): no version column. When rotation is needed, a future
 * migration adds the column AND re-encrypts existing rows. Acceptable for
 * single-user scale.
 *
 * Key generation:
 *   openssl rand -base64 32
 * Store the output in ENCRYPTION_KEY env var (Vercel encrypted env).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { env } from "@/lib/env";

// Decode the key once at module load. lib/env.ts has already validated
// that ENCRYPTION_KEY decodes to exactly 32 bytes, so this is safe.
const KEY = Buffer.from(env.ENCRYPTION_KEY, "base64");

// Defensive assertion — env validation should have caught this, but
// we assert explicitly so tests for missing-key see import-time failure
// even if the env validator is bypassed.
if (KEY.byteLength !== 32) {
  throw new Error(
    `[crypto] ENCRYPTION_KEY must decode to 32 bytes (got ${KEY.byteLength}). Generate with: openssl rand -base64 32`,
  );
}

const IV_LEN = 12; // Standard GCM IV length
const TAG_LEN = 16; // Standard GCM auth-tag length

/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 *
 * Returns base64(iv ‖ authTag ‖ ciphertext).
 * The IV is generated freshly per call using crypto.randomBytes — never reused.
 *
 * @param plaintext - Any UTF-8 string, including empty string.
 * @returns base64-encoded blob containing IV, auth tag, and ciphertext.
 * @throws If ENCRYPTION_KEY is missing or invalid (caught at module load).
 */
export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypts a blob produced by encryptString.
 *
 * Verifies the GCM authentication tag before returning any data.
 * Throws if the blob is malformed or if the auth tag fails verification
 * (indicating tampering or a wrong key). Error messages do not include
 * any plaintext content (defense against information leakage in logs).
 *
 * @param blob - base64-encoded blob produced by encryptString.
 * @returns Original UTF-8 plaintext.
 * @throws If blob is malformed, too short, or auth tag verification fails.
 */
export function decryptString(blob: string): string {
  const decoded = Buffer.from(blob, "base64");
  if (decoded.byteLength < IV_LEN + TAG_LEN) {
    throw new Error(
      "[crypto] Ciphertext blob is too short to be valid (missing IV or auth tag)",
    );
  }
  const iv = decoded.subarray(0, IV_LEN);
  const authTag = decoded.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = decoded.subarray(IV_LEN + TAG_LEN);
  const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  // decipher.final() throws on auth-tag mismatch — this is the tamper-detection
  // guarantee. Never suppress or catch this exception.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
