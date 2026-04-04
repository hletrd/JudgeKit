/**
 * PostgreSQL integration test database helper.
 *
 * Each call provisions an isolated temporary database, runs the real project
 * migrations into it, and returns a Drizzle client bound to that database.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@/lib/db/schema";
import * as relations from "@/lib/db/relations";

const schemaWithRelations = { ...schema, ...relations } as const;
type AppSchema = typeof schemaWithRelations;

function getIntegrationDatabaseUrl() {
  return (
    process.env.INTEGRATION_DATABASE_URL ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  ).trim();
}

export const hasPostgresIntegrationSupport = getIntegrationDatabaseUrl().length > 0;

export type TestDb = {
  db: NodePgDatabase<AppSchema>;
  client: PoolClient;
  pool: Pool;
  databaseName: string;
  cleanup: () => Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const connectionString = getIntegrationDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  }

  const databaseName = `itest_${nanoid().replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const adminPool = new Pool({ connectionString, max: 1 });
  const adminClient = await adminPool.connect();
  await adminClient.query(`CREATE DATABASE "${databaseName}"`);
  adminClient.release();
  await adminPool.end();

  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${databaseName}`;

  const pool = new Pool({ connectionString: testUrl.toString(), max: 1 });
  const client = await pool.connect();
  const db = drizzle(client, { schema: schemaWithRelations });
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../drizzle/pg"
  );
  await migrate(db as any, { migrationsFolder });

  return {
    db,
    client,
    pool,
    databaseName,
    cleanup: async () => {
      const cleanupPool = new Pool({ connectionString, max: 1 });
      try {
        client.release();
        await pool.end();
        const cleanupClient = await cleanupPool.connect();
        try {
          await cleanupClient.query(
            `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
             WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [databaseName]
          );
          await cleanupClient.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        } finally {
          cleanupClient.release();
        }
      } finally {
        await cleanupPool.end();
      }
    },
  };
}
