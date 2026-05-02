/**
 * Idempotent category + account seed (D-17, D-18, D-19).
 *
 * - 14 categories: 10 expense, 3 income, 1 transfer (CONTEXT D-17 exact list)
 * - 1 account: 'Efectivo' (cash) (CONTEXT D-18, D-19)
 *
 * Idempotency: if categories table has any row, skip (no-op for that table).
 * Same independent guard for accounts so categories-seeded-but-account-missing repairs.
 * Uses onConflictDoNothing for defensive double-protection. Designed to run on every
 * Vercel build via scripts/migrate.ts (mirrors Phase 1 D-09 migration-on-build pattern).
 *
 * Usage:
 *   npm run db:migrate                                          # invoked from scripts/migrate.ts
 *   npx tsx --env-file=.env.local scripts/seed-categories.ts    # standalone
 */

import { count } from "drizzle-orm";
import { db } from "../lib/db";
import {
  categories,
  accounts,
  type NewCategory,
  type NewAccount,
} from "../drizzle/schema";

const SEED_CATEGORIES: Omit<NewCategory, "id" | "createdAt">[] = [
  // Gastos (expense, sort_order ascending)
  { name: "Supermercado", kind: "expense", sortOrder: 10, isSystem: true },
  { name: "Restaurantes", kind: "expense", sortOrder: 20, isSystem: true },
  { name: "Transporte", kind: "expense", sortOrder: 30, isSystem: true },
  { name: "Suministros", kind: "expense", sortOrder: 40, isSystem: true },
  { name: "Telecom", kind: "expense", sortOrder: 50, isSystem: true },
  { name: "Vivienda", kind: "expense", sortOrder: 60, isSystem: true },
  { name: "Ocio", kind: "expense", sortOrder: 70, isSystem: true },
  { name: "Salud", kind: "expense", sortOrder: 80, isSystem: true },
  { name: "Compras", kind: "expense", sortOrder: 90, isSystem: true },
  { name: "Otros gastos", kind: "expense", sortOrder: 100, isSystem: true },
  // Ingresos
  { name: "Nómina", kind: "income", sortOrder: 200, isSystem: true },
  { name: "Bizum recibido", kind: "income", sortOrder: 210, isSystem: true },
  { name: "Otros ingresos", kind: "income", sortOrder: 220, isSystem: true },
  // Movimientos
  { name: "Traspaso interno", kind: "transfer", sortOrder: 300, isSystem: true },
];

const SEED_ACCOUNT: Omit<NewAccount, "id" | "createdAt"> = {
  displayName: "Efectivo",
  currency: "EUR",
  type: "cash",
  isArchived: false,
};

export async function seedCategoriesAndAccounts(): Promise<void> {
  // Categories idempotency guard
  const catCount = await db.select({ value: count() }).from(categories);
  const existingCategories = Number(catCount[0]?.value ?? 0);

  if (existingCategories === 0) {
    await db.insert(categories).values(SEED_CATEGORIES).onConflictDoNothing();
    process.stderr.write(
      `[seed-categories] Inserted ${SEED_CATEGORIES.length} categories.\n`,
    );
  } else {
    process.stderr.write(
      `[seed-categories] ${existingCategories} categories already exist; skipping seed.\n`,
    );
  }

  // Accounts idempotency guard (separate guard so categories-seeded-but-account-missing repairs)
  const accCount = await db.select({ value: count() }).from(accounts);
  const existingAccounts = Number(accCount[0]?.value ?? 0);

  if (existingAccounts === 0) {
    await db.insert(accounts).values([SEED_ACCOUNT]).onConflictDoNothing();
    process.stderr.write(`[seed-categories] Inserted seed 'Efectivo' account.\n`);
  } else {
    process.stderr.write(
      `[seed-categories] ${existingAccounts} accounts already exist; skipping seed.\n`,
    );
  }
}

// Allow running standalone: `tsx --env-file=.env.local scripts/seed-categories.ts`
if (require.main === module) {
  seedCategoriesAndAccounts()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      process.stderr.write(
        `[seed-categories] UNHANDLED: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
