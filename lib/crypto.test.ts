/**
 * lib/crypto.test.ts — Unit tests for AES-256-GCM encryption helper.
 *
 * Covers all 6 D-03 acceptance categories:
 * 1. round-trip
 * 2. tamper-detection
 * 3. empty-string
 * 4. multi-byte UTF-8
 * 5. missing-key
 * 6. deterministic-output-format (IV uniqueness)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Two known-valid 32-byte base64 keys for testing
// Generated via: openssl rand -base64 32
const TEST_KEY_A = "WUyR2GFBxbCMlnCmpcYxq2GMrwlnLZksB8onbVDzPYg=";
const TEST_KEY_B = "1zPxOEX2hnUTqDQjfCXa3UpBdtLR2pkXh3qXbZNiOIs=";

// Verify our test keys decode to exactly 32 bytes (sanity check)
if (Buffer.from(TEST_KEY_A, "base64").byteLength !== 32) {
  throw new Error("TEST_KEY_A is not 32 bytes — fix the test fixture");
}
if (Buffer.from(TEST_KEY_B, "base64").byteLength !== 32) {
  throw new Error("TEST_KEY_B is not 32 bytes — fix the test fixture");
}

describe("lib/crypto", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY_A);
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("round-trip", () => {
    it("ASCII round-trip", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const blob = encryptString("hello world");
      expect(decryptString(blob)).toBe("hello world");
    });

    it("produces base64 output", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const blob = encryptString("x");
      expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("different IV per call (uniqueness)", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const blobs = new Set<string>();
      for (let i = 0; i < 100; i++) blobs.add(encryptString("same input"));
      expect(blobs.size).toBe(100);
    });

    it("blob layout matches iv(12) + tag(16) + ciphertext", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const blob = encryptString("hello"); // 5 bytes plaintext
      const decoded = Buffer.from(blob, "base64");
      expect(decoded.byteLength).toBe(12 + 16 + 5);
    });
  });

  describe("tamper-detection", () => {
    it("flipped byte in ciphertext throws", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const blob = encryptString("secret");
      const decoded = Buffer.from(blob, "base64");
      // Flip the last byte (within ciphertext region) using writeUInt8 for type safety
      decoded.writeUInt8(decoded.readUInt8(decoded.byteLength - 1) ^ 0xff, decoded.byteLength - 1);
      const tampered = decoded.toString("base64");
      expect(() => decryptString(tampered)).toThrow();
    });

    it("truncated blob throws", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const blob = encryptString("secret");
      expect(() => decryptString(blob.slice(0, -8))).toThrow();
    });

    it("wrong key throws", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const blob = encryptString("secret");
      // Swap key for decrypt — reset modules so env re-evaluates with new key
      vi.stubEnv("ENCRYPTION_KEY", TEST_KEY_B);
      vi.resetModules();
      const { decryptString } = await import("@/lib/crypto");
      expect(() => decryptString(blob)).toThrow();
    });

    it("completely random blob throws", async () => {
      const { decryptString } = await import("@/lib/crypto");
      // 28 bytes (iv + tag with no ciphertext for non-empty plaintext) — invalid GCM
      // Using a proper 28-byte base64 string that would parse but fail auth-tag
      expect(() => decryptString("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==")).toThrow();
    });

    it("error message does not leak plaintext", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const blob = encryptString("super-secret-token-xyz");
      const tampered = blob.slice(0, -4) + "AAAA";
      try {
        decryptString(tampered);
        expect.fail("should have thrown");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).not.toContain("super-secret-token-xyz");
      }
    });
  });

  describe("empty-string", () => {
    it("empty round-trip", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      expect(decryptString(encryptString(""))).toBe("");
    });

    it("empty produces non-empty blob", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const blob = encryptString("");
      expect(blob.length).toBeGreaterThan(0);
      // Decoded blob is exactly iv(12) + tag(16) = 28 bytes for empty plaintext
      expect(Buffer.from(blob, "base64").byteLength).toBe(28);
    });
  });

  describe("multi-byte UTF-8", () => {
    it("Spanish accents round-trip", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const input = "contraseña con eñes y ácidos: ñÑáéíóúüÜ";
      expect(decryptString(encryptString(input))).toBe(input);
    });

    it("emoji + CJK round-trip", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const input = "🇪🇸 中文 ñ 日本語 한국어";
      expect(decryptString(encryptString(input))).toBe(input);
    });
  });

  describe("missing-key", () => {
    it("throws when ENCRYPTION_KEY is absent", async () => {
      vi.stubEnv("ENCRYPTION_KEY", "");
      vi.resetModules();
      await expect(async () => await import("@/lib/crypto")).rejects.toThrow();
    });

    it("throws when ENCRYPTION_KEY is too short (16 bytes)", async () => {
      // 16 bytes base64-encoded = 24 chars
      vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
      vi.resetModules();
      await expect(async () => await import("@/lib/crypto")).rejects.toThrow();
    });
  });

  describe("deterministic-output-format", () => {
    it("first 12 bytes of decoded blob change per call (IV is random)", async () => {
      const { encryptString } = await import("@/lib/crypto");
      const ivs = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const blob = encryptString("same string");
        const decoded = Buffer.from(blob, "base64");
        const iv = decoded.subarray(0, 12).toString("hex");
        ivs.add(iv);
      }
      expect(ivs.size).toBe(10);
    });

    it("blob format: byte 0-11 is IV, byte 12-27 is auth tag, byte 28+ is ciphertext", async () => {
      const { encryptString, decryptString } = await import("@/lib/crypto");
      const plaintext = "a"; // 1 byte
      const blob = encryptString(plaintext);
      const decoded = Buffer.from(blob, "base64");

      // Total length: iv(12) + authTag(16) + ciphertext(1) = 29
      expect(decoded.byteLength).toBe(29);

      // Extract components using the documented layout
      const iv = decoded.subarray(0, 12);
      const authTag = decoded.subarray(12, 28);
      const ciphertext = decoded.subarray(28);

      // Each component has the right size
      expect(iv.byteLength).toBe(12);
      expect(authTag.byteLength).toBe(16);
      expect(ciphertext.byteLength).toBe(1);

      // Reconstruct the blob and confirm decryption still works
      const reconstructed = Buffer.concat([iv, authTag, ciphertext]).toString("base64");
      expect(decryptString(reconstructed)).toBe(plaintext);
    });
  });
});
