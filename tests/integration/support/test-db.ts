/**
 * In-memory SQLite test database helper.
 *
 * Uses the Drizzle migrator with the project's real migration files to
 * create a fully-schema'd database for each test suite. Every call to
 * `createTestDb()` returns an isolated in-memory instance so tests never
 * share state.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import * as relations from "@/lib/db/relations";

export type TestDb = ReturnType<typeof createTestDb>;

/**
 * Creates a fresh in-memory SQLite database with the full Drizzle schema
 * applied via migrations.
 *
 * @example
 * ```ts
 * let ctx: TestDb;
 * beforeEach(() => { ctx = createTestDb(); });
 * afterEach(() => { ctx.cleanup(); });
 * ```
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema: { ...schema, ...relations } });

  // Apply all migrations from the project root drizzle folder
  const migrationsFolder = path.resolve(__dirname, "../../../drizzle/migrations");
  migrate(db, { migrationsFolder });

  return {
    db,
    sqlite,
    cleanup: () => sqlite.close(),
  };
}
