/**
 * Migration runner — invoked by `npm run build` (D-09) and `npm run db:migrate` (manual).
 *
 * Applies all pending migrations in drizzle/migrations against env.DATABASE_URL.
 * Idempotent: drizzle-orm migrator tracks applied migrations in __drizzle_migrations.
 *
 * Phase 2 (D-17): after migrations resolve, also runs seedCategoriesAndAccounts()
 * which inserts 14 system categories + 1 Efectivo cash account on a fresh DB and
 * is a no-op when those rows already exist.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";
import { seedCategoriesAndAccounts } from "./seed-categories";

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
}

async function main() {
  const sql = neon(env.DATABASE_URL);
  const db = drizzle(sql);
  process.stderr.write(
    `[migrate] Applying migrations against ${maskUrl(env.DATABASE_URL)}\n`,
  );
  const start = Date.now();
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  const ms = Date.now() - start;
  process.stderr.write(`[migrate] Done in ${ms}ms\n`);

  await seedCategoriesAndAccounts();
  process.stderr.write("[migrate] Seed complete.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[migrate] FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
