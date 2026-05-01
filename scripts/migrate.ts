/**
 * Migration runner — invoked by `npm run build` (D-09) and `npm run db:migrate` (manual).
 *
 * Applies all pending migrations in drizzle/migrations against env.DATABASE_URL.
 * Idempotent: drizzle-orm's migrator tracks applied migrations in __drizzle_migrations.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";

function maskUrl(url: string): string {
  // postgresql://user:pass@host/db -> postgresql://user:***@host/db
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
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[migrate] FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
