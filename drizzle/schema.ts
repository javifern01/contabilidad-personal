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
  bigint,
  integer,
  uuid,
  date,
  numeric,
  real,
  index,
  uniqueIndex,
  check,
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

// ---------- Phase 2 tables (D-16, D-18, D-20) — accounts / categories / transactions ----------
// MONEY-AS-BIGINT (FND-02): amount_cents and amount_eur_cents are bigint (positive cents per D-21).
// Sign is derived from category.kind at aggregation time (D-26). CHECK constraint enforces positivity.
// Partial indexes filter `WHERE soft_deleted_at IS NULL` so list/dashboard reads skip trash rows.
//
// SELF-FK on transactions.transfer_pair_id (D-20): the column-level reference is omitted here
// because Drizzle's self-FK requires deferred reference / relations() boilerplate. The FK
// constraint is added via raw SQL in the generated migration (mirrors Phase 1's INET hand-patch
// pattern). Phase 3 fills transfer_pair_id when auto-detect ships.

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  // TODO: Phase 4 may tighten to varchar(3) / CHECK (length=3); D-18 specifies char(3).
  currency: text("currency").notNull().default("EUR"),
  type: text("type"), // 'cash' | 'checking' | 'savings' | 'credit_card' (nullable; Phase 4 may tighten)
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // 'expense' | 'income' | 'transfer'
    sortOrder: integer("sort_order").notNull().default(100),
    isSystem: boolean("is_system").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("categories_kind_check", sql`${t.kind} IN ('expense','income','transfer')`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    externalId: text("external_id"),
    dedupKey: text("dedup_key").notNull(),
    bookingDate: date("booking_date", { mode: "date" }).notNull(),
    valueDate: date("value_date", { mode: "date" }),
    amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
    amountEurCents: bigint("amount_eur_cents", { mode: "bigint" }).notNull(),
    originalCurrency: text("original_currency").notNull().default("EUR"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    descriptionRaw: text("description_raw").notNull(),
    merchantNormalized: text("merchant_normalized"),
    counterpartyName: text("counterparty_name"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    categorySource: text("category_source").notNull().default("manual"),
    categoryConfidence: real("category_confidence"),
    status: text("status").notNull().default("posted"),
    // FK on transfer_pair_id is added via raw SQL in the migration (see Phase 2 migration tail).
    transferPairId: uuid("transfer_pair_id"),
    source: text("source").notNull().default("manual"),
    notes: text("notes"),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    softDeletedAt: timestamp("soft_deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("transactions_account_dedup_unique_idx").on(t.accountId, t.dedupKey),
    index("transactions_booking_date_partial_idx")
      .on(t.bookingDate.desc())
      .where(sql`${t.softDeletedAt} IS NULL`),
    index("transactions_account_booking_partial_idx")
      .on(t.accountId, t.bookingDate.desc())
      .where(sql`${t.softDeletedAt} IS NULL`),
    index("transactions_category_booking_partial_idx")
      .on(t.categoryId, t.bookingDate.desc())
      .where(sql`${t.softDeletedAt} IS NULL`),
    check("transactions_amount_cents_positive_check", sql`${t.amountCents} > 0`),
    check(
      "transactions_amount_eur_cents_positive_check",
      sql`${t.amountEurCents} > 0`,
    ),
  ],
);

// ---------- Type exports for downstream phases ----------
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type AuthAuditLogRow = typeof authAuditLog.$inferSelect;
export type NewAuthAuditLogRow = typeof authAuditLog.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
