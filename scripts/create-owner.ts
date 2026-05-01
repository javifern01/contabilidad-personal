/**
 * Idempotent owner bootstrap (D-05).
 *
 * Reads OWNER_EMAIL + OWNER_PASSWORD from env.
 * If the user table is empty: creates one user via Better Auth's signUpEmail
 *   (which handles scrypt hashing + the `account` row so signInEmail works correctly).
 * If non-empty: prints "Owner already exists; refusing." and exits 0 (re-runs are safe).
 *
 * Usage:
 *   npm run create-owner                        # loads .env.local automatically
 *   tsx scripts/create-owner.ts                # with explicit env vars in shell
 *
 * Environment variables required:
 *   OWNER_EMAIL     - valid email address (becomes the owner's login)
 *   OWNER_PASSWORD  - at least 12 characters
 *   DATABASE_URL    - Neon connection string (same as app)
 *   BETTER_AUTH_SECRET, BETTER_AUTH_URL - same values as app .env.local
 */

import { z } from "zod";
import { count } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user } from "../drizzle/schema";

const inputSchema = z.object({
  OWNER_EMAIL: z.string().email("OWNER_EMAIL must be a valid email"),
  OWNER_PASSWORD: z
    .string()
    .min(12, "OWNER_PASSWORD must be at least 12 characters")
    .max(512, "OWNER_PASSWORD too long"),
});

async function main() {
  // Validate required env vars before hitting the DB.
  const parsed = inputSchema.safeParse({
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    OWNER_PASSWORD: process.env.OWNER_PASSWORD,
  });
  if (!parsed.success) {
    process.stderr.write(
      `[create-owner] Invalid input: ${JSON.stringify(parsed.error.flatten().fieldErrors)}\n`,
    );
    process.exit(1);
  }
  const { OWNER_EMAIL, OWNER_PASSWORD } = parsed.data;

  // Idempotency guard (D-05): refuse if any user already exists.
  // Counts rows in the `user` table; exits cleanly if non-zero (re-runs are safe).
  const rows = await db.select({ value: count() }).from(user);
  const existing = rows[0]?.value ?? 0;

  if (Number(existing) > 0) {
    process.stderr.write(
      "[create-owner] Owner already exists; refusing. (D-05 idempotency guard)\n",
    );
    process.exit(0);
  }

  // Use Better Auth's signUpEmail to create the user + account row with a scrypt-hashed
  // password. This ensures a subsequent signInEmail call verifies the hash correctly.
  // The name defaults to the email local-part (owner can update via profile in Phase 7).
  try {
    await auth.api.signUpEmail({
      body: {
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        name: OWNER_EMAIL.split("@")[0] ?? "Propietario",
      },
    });
  } catch (err: unknown) {
    process.stderr.write(
      `[create-owner] FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  process.stderr.write(`[create-owner] Owner created: ${OWNER_EMAIL}\n`);
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[create-owner] UNHANDLED: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
