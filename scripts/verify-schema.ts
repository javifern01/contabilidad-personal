/**
 * One-shot verification script — confirms Phase 1 tables and index exist in live DB.
 * Run: npx tsx --env-file=.env.local scripts/verify-schema.ts
 * Delete after plan 01-03 Task 3 is verified.
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('user', 'session', 'account', 'verification', 'auth_audit_log')
    ORDER BY table_name`;
  process.stdout.write(
    "TABLES: " +
      JSON.stringify(tables.map((r: Record<string, unknown>) => r.table_name)) +
      "\n",
  );
  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'auth_audit_log' AND indexname = 'auth_audit_log_ip_failure_idx'`;
  process.stdout.write(
    "INDEX:  " +
      JSON.stringify(idx.map((r: Record<string, unknown>) => r.indexname)) +
      "\n",
  );
}

main().catch((err: unknown) => {
  process.stderr.write(
    `ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
