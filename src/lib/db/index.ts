import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as relations from "./relations";
import { getDialect } from "./config";
import type { DbDialect } from "./config";
import path from "path";
import fs from "fs";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * The active database dialect. Determined at startup from DB_DIALECT env var.
 * Defaults to "sqlite" during build phase.
 */
export const activeDialect: DbDialect = isBuildPhase ? "sqlite" : getDialect();

// --- SQLite (default, compile-time types) ---

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "judge.db");

let sqlite: Database.Database;

if (activeDialect === "sqlite") {
  if (isBuildPhase) {
    sqlite = new Database(":memory:");
  } else {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    sqlite = new Database(dbPath);
  }

  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("wal_autocheckpoint = 100");
} else {
  // Dummy instance for non-SQLite — never used at runtime
  sqlite = null as unknown as Database.Database;
}

/**
 * The Drizzle ORM database instance.
 *
 * At compile time this is always typed as the SQLite Drizzle instance.
 * At runtime, when DB_DIALECT is "postgresql" or "mysql", this is replaced
 * with the appropriate driver's Drizzle instance. The query builder API
 * is compatible across all dialects.
 */
let db = drizzle(activeDialect === "sqlite" ? sqlite : new Database(":memory:"), {
  schema: { ...schema, ...relations },
});

// Runtime override for non-SQLite dialects
if (activeDialect === "postgresql" && !isBuildPhase) {
  const { Pool } = require("pg") as typeof import("pg");
  const { drizzle: pgDrizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
  const pgSchema = require("./schema.pg");
  const pgRelations = require("./relations.pg");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when DB_DIALECT=postgresql");

  const pool = new Pool({ connectionString: url });
  db = pgDrizzle(pool, { schema: { ...pgSchema, ...pgRelations } }) as unknown as typeof db;
  (module as any)._pool = pool;
} else if (activeDialect === "mysql" && !isBuildPhase) {
  const mysql2 = require("mysql2/promise") as typeof import("mysql2/promise");
  const { drizzle: mysqlDrizzle } = require("drizzle-orm/mysql2") as typeof import("drizzle-orm/mysql2");
  const mysqlSchema = require("./schema.mysql");
  const mysqlRelations = require("./relations.mysql");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when DB_DIALECT=mysql");

  const pool = mysql2.createPool(url);
  db = mysqlDrizzle(pool, { schema: { ...mysqlSchema, ...mysqlRelations } }) as unknown as typeof db;
  (module as any)._pool = pool;
}

/**
 * Connection pool for PostgreSQL/MySQL. Null for SQLite.
 */
export const pool: any = (module as any)._pool ?? null;

export { db, sqlite };
export type DbType = typeof db;

// Set file permissions for SQLite
if (activeDialect === "sqlite" && !isBuildPhase) {
  try {
    for (const ext of ["", "-wal", "-shm"]) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) {
        fs.chmodSync(p, 0o600);
      }
    }
  } catch {
    // non-fatal
  }
}
