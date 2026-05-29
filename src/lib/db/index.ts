import { AsyncLocalStorage } from "async_hooks";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.pg";
import * as relations from "./relations.pg";
import { attachPoolDiagnostics } from "./pool-health";
import { logger } from "@/lib/logger";

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

  const poolMax = parsePoolEnv("DATABASE_POOL_MAX", 20);
  _pool = new Pool({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: parsePoolEnv("DATABASE_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: parsePoolEnv("DATABASE_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    // Recycle connections after this lifetime to avoid clinging to backends
    // that survived a failover or proxy (pgbouncer) restart. 0 = disabled
    // (default), preserving prior behavior unless explicitly opted in.
    maxLifetimeSeconds: parsePoolEnv("DATABASE_POOL_MAX_LIFETIME_SECONDS", 0),
    // Surface the app in pg_stat_activity so pool-exhaustion / leaked-connection
    // incidents are diagnosable by connection source.
    application_name: process.env.DATABASE_POOL_APP_NAME ?? "judgekit-app",
  });
  db = drizzle(_pool, { schema: schemaWithRelations });

  // Attach the idle-client error handler (prevents a transient DB blip from
  // crashing the process with an uncaught exception) and the saturation
  // sampler. The sampler timer is unref'd so it never keeps the process alive.
  attachPoolDiagnostics(_pool, { logger, max: poolMax });
}

/**
 * Connection pool for PostgreSQL.
 */
export const pool: Pool | null = _pool;

/**
 * AsyncLocalStorage marker used to detect when rawQueryOne/rawQueryAll are
 * called inside a transaction callback (they run on the global pool and do
 * NOT participate in the Drizzle transaction). See rawQueryOne in queries.ts.
 */
export const transactionContext = new AsyncLocalStorage<boolean>();

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

  return db.transaction(async (tx) => transactionContext.run(true, () => fn(tx as TransactionClient)));
}

export { db };
export type DbType = NodePgDatabase<AppSchema>;
