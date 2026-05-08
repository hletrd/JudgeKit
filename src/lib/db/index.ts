import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.pg";
import * as relations from "./relations.pg";

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * The active database dialect. Always "postgresql".
 * @deprecated Multi-dialect support has been removed. Use "postgresql" directly.
 */
export const activeDialect = "postgresql" as const;

// --- PostgreSQL connection ---

let _pool: Pool | null = null;
const schemaWithRelations = { ...schema, ...relations } as const;
type AppSchema = typeof schemaWithRelations;
let db: NodePgDatabase<AppSchema>;

function parsePoolEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

if (isBuildPhase) {
  // During build phase, create a dummy drizzle instance for type-checking.
  // No actual DB connection is made.
  db = drizzle("postgres://build:build@localhost:5432/build", {
    schema: schemaWithRelations,
  });
} else {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  _pool = new Pool({
    connectionString: url,
    max: parsePoolEnv("DATABASE_POOL_MAX", 20),
    idleTimeoutMillis: parsePoolEnv("DATABASE_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: parsePoolEnv("DATABASE_POOL_CONNECTION_TIMEOUT_MS", 10_000),
  });
  db = drizzle(_pool, { schema: schemaWithRelations });
}

/**
 * Connection pool for PostgreSQL.
 */
export const pool: Pool | null = _pool;

/**
 * Transaction client type inferred from Drizzle's transaction callback.
 */
export type TransactionClient = Parameters<Parameters<DbType["transaction"]>[0]>[0];

/**
 * Run a function inside a real PostgreSQL transaction.
 *
 * WARNING: During build/type-check phases (`NEXT_PHASE === "phase-production-build"`),
 * there is no live database connection. The callback runs against the build-phase
 * drizzle instance WITHOUT opening a transaction. Callers that require atomicity
 * (e.g., rate-limit checks with SELECT FOR UPDATE, advisory locks, or multi-table
 * writes) must not rely on transaction semantics during build. This fallback exists
 * only to allow type-checking of code paths that call `execTransaction`.
 */
export function execTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T> | T
): Promise<T> {
  if (isBuildPhase) {
    return Promise.resolve(fn(db as unknown as TransactionClient));
  }

  return db.transaction(async (tx) => fn(tx as TransactionClient));
}

export { db };
export type DbType = NodePgDatabase<AppSchema>;
