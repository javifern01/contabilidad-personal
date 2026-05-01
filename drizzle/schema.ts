/**
 * Drizzle schema — Phase 1 (auth + audit only) per CONTEXT D-08.
 *
 * MONEY-AS-BIGINT (FND-02): All future monetary columns MUST use bigint (cents).
 * Floating-point types are forbidden for currency. Phase 2 (transactions) follows
 * the convention `amount_cents bigint NOT NULL` per ARCHITECTURE.md data model.
 *
 * TIMEZONE (FND-06): All timestamp columns use TIMESTAMPTZ. Month-boundary aggregations
 * use `date_trunc('month', col AT TIME ZONE 'Europe/Madrid')` per ARCHITECTURE.md.
 *
 * BETTER-AUTH-OWNED (D-10): The four Better Auth tables (user, session, account, verification)
 * are defined here once and versioned forever. The Better Auth CLI generator is run only
 * once during initial setup. All schema changes thereafter go through `drizzle-kit generate`.
 *
 * INET COLUMN: Drizzle's pg-core has no first-class `inet` builder at 0.45.2. The TS layer
 * declares `ip` as text; the generated migration is hand-edited to use `inet`. See
 * drizzle/migrations/0000_phase1_auth_and_audit.sql post-generation patch.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  timestamp,
  bigserial,
  index,
} from "drizzle-orm/pg-core";

// ---------- Better Auth tables (D-08, D-10) ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
    withTimezone: true,
    mode: "date",
  }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
    withTimezone: true,
    mode: "date",
  }),
  scope: text("scope"),
  password: text("password"), // scrypt hash for credentials provider (D-04)
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow(),
});

// ---------- Auth audit log (D-13) ----------
// Append-only. No UPDATE, no DELETE in app code. Powers rate-limit window query (D-12).

export const authAuditLog = pgTable(
  "auth_audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    eventType: text("event_type").notNull(), // 'login_success'|'login_failure'|'login_blocked'|'logout'
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ip: text("ip").notNull(), // hand-patched to INET in the generated SQL — see file header comment
    userAgent: text("user_agent"),
    failureReason: text("failure_reason"), // 'invalid_password'|'unknown_email'|'rate_limited'|'session_expired'
  },
  (t) => [
    // D-12 rate-limit window query support
    index("auth_audit_log_ip_failure_idx")
      .on(t.ip, t.occurredAt.desc())
      .where(sql`${t.eventType} IN ('login_failure', 'login_blocked')`),
  ],
);

// ---------- Type exports for downstream phases ----------
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type AuthAuditLogRow = typeof authAuditLog.$inferSelect;
export type NewAuthAuditLogRow = typeof authAuditLog.$inferInsert;
