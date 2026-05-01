import type { Config } from "drizzle-kit";

// drizzle-kit generate does not need a live connection; only migrate/push/check do.
// We read DATABASE_URL directly here so that `generate` works without a .env.local file.
// The scripts/migrate.ts runner and lib/db.ts both go through lib/env.ts (fail-fast).
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@placeholder.neon.tech/placeholder";

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
} satisfies Config;
