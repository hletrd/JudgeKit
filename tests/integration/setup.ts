/**
 * Integration test global setup.
 *
 * This file is wired into `vitest.config.integration.ts` and runs before any
 * integration test. It performs a fail-fast check on the database environment:
 *
 * - If `SKIP_INTEGRATION_TESTS=1`, the suite is skipped explicitly.
 * - Otherwise a PostgreSQL connection string must be available and reachable.
 *   SQLite or a missing URL causes an immediate, descriptive error instead of
 *   silent test skips.
 */

import { Pool } from "pg";

function getIntegrationDatabaseUrl(): string {
  return (
    process.env.INTEGRATION_DATABASE_URL ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  ).trim();
}

async function probePostgres(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (process.env.SKIP_INTEGRATION_TESTS === "1" || process.env.SKIP_INTEGRATION_TESTS === "true") {
    console.log(
      "[integration] SKIP_INTEGRATION_TESTS is set — skipping Postgres integration tests."
    );
    return;
  }

  const connectionString = getIntegrationDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      "Integration tests require a PostgreSQL database. " +
        "Set one of INTEGRATION_DATABASE_URL, TEST_DATABASE_URL, or DATABASE_URL " +
        "to a postgres:// connection string, or set SKIP_INTEGRATION_TESTS=1 to skip."
    );
  }

  if (connectionString.startsWith("sqlite:")) {
    throw new Error(
      "Integration tests require PostgreSQL; SQLite is not supported. " +
        "Set a postgres:// connection string or SKIP_INTEGRATION_TESTS=1."
    );
  }

  if (!connectionString.startsWith("postgres")) {
    throw new Error(
      `Integration tests require a postgres:// connection string, got: ${connectionString.split("://")[0]}://... Set a valid PostgreSQL URL or SKIP_INTEGRATION_TESTS=1.`
    );
  }

  try {
    await probePostgres(connectionString);
  } catch (error) {
    throw new Error(
      `Integration tests could not connect to PostgreSQL at ${connectionString.replace(/\/\/[^@]+@/, "//***@")}. ` +
        "Ensure the server is running and the connection string is correct, " +
        "or set SKIP_INTEGRATION_TESTS=1.",
      { cause: error }
    );
  }
}

await main();
