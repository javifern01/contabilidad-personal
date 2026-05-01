/**
 * Better Auth singleton (D-04, D-06).
 *
 * Email + password only (no social providers, no passkeys, no 2FA at Phase 1).
 * DB-backed sessions via the Drizzle adapter — every authenticated request
 * hits the session table for instant revocation (the "log out everywhere" property).
 *
 * The `nextCookies` plugin ensures that Set-Cookie headers emitted by auth API
 * calls inside Next.js Server Actions are applied via `next/headers` cookies().
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/drizzle/schema";
import { env } from "@/lib/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    // scrypt is the Better Auth 1.6 default; explicit for clarity
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days absolute
    updateAge: 60 * 60 * 24, // refresh idle session every 24h
    cookieCache: { enabled: false }, // D-06: hit DB on every request for revocation guarantee
  },
  trustedOrigins: [env.BETTER_AUTH_URL],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // No emailVerification (deferred per CONTEXT.md)
  // No socialProviders (D-04: email+password only at Phase 1)
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
