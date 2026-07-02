/**
 * Raw SQL query helpers for PostgreSQL.
 */

import { sql } from "drizzle-orm";
import { pool, transactionContext } from "./index";
import { namedToPositional } from "./named-params";
import type { TransactionClient } from "./index";

/**
 * Returns a SQL expression for "current time in milliseconds since epoch".
 */
export function nowMs(): string {
  return "(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint";
}

/**
 * Returns the ORDER BY clause for deterministic row ordering.
 */
export function deterministicOrder(idColumn: string = "id"): string {
  return `${idColumn} ASC`;
}

/**
 * Returns the SQL expression for counting tables in the database.
 */
export function countTablesQuery(): string {
  return "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'";
}

/**
 * Build a Drizzle `sql` tagged query from pre-translated positional SQL text
 * and a value array. The result preserves parameterization (values are bound
 * as Drizzle params, not interpolated) and can be executed against either the
 * global pool or a transaction client.
 */
function buildSqlQuery(text: string, values: unknown[]) {
  const strings: string[] = [];
  const params: unknown[] = [];
  const placeholderRe = /\$(\d+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderRe.exec(text)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    strings.push(text.slice(lastIndex, match.index));
    params.push(values[idx]);
    lastIndex = placeholderRe.lastIndex;
  }
  strings.push(text.slice(lastIndex));

  return sql(strings as unknown as TemplateStringsArray, ...params);
}

async function runRawQuery<T>(
  sqlText: string,
  values: unknown[],
  tx: TransactionClient | undefined,
): Promise<{ rows: T[] }> {
  if (tx) {
    const result = await tx.execute(buildSqlQuery(sqlText, values));
    return result as { rows: T[] };
  }

  if (!pool) throw new Error("PostgreSQL pool not available");
  const result = await pool.query(sqlText, values);
  return result as { rows: T[] };
}

/**
 * Execute a raw SQL query that returns a single row.
 *
 * **WARNING:** When called outside of `execTransaction`, this helper runs on
 * the global connection pool. Inside `execTransaction`, it is automatically
 * routed through the active transaction client so it participates in the
 * transaction.
 *
 * **WARNING:** This helper cannot validate at runtime that the returned
 * row actually matches `T`. The generic parameter is purely a developer
 * convenience — the SQL text and the type can drift independently.
 *
 * Callers MUST ensure one of the following:
 *   1. The SQL query is maintained alongside the type (same file/owner).
 *   2. The result is validated with a runtime schema (Zod, etc.) before use.
 *   3. The cast is visible at the call site so reviewers can audit it.
 *
 * Do not pass user-supplied type parameters; always use a concrete type
 * that is co-located with the SQL query.
 */
export async function rawQueryOne<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T | undefined> {
  const { text, values } = namedToPositional(sql, params);
  const tx = transactionContext.getStore();
  const result = await runRawQuery<T>(text, values, tx);
  return result.rows[0];
}

/**
 * Execute a raw SQL query that returns multiple rows.
 *
 * **WARNING:** When called outside of `execTransaction`, this helper runs on
 * the global connection pool. Inside `execTransaction`, it is automatically
 * routed through the active transaction client so it participates in the
 * transaction.
 *
 * **WARNING:** This helper cannot validate at runtime that the returned
 * rows actually match `T`. The generic parameter is purely a developer
 * convenience — the SQL text and the type can drift independently.
 *
 * Callers MUST ensure one of the following:
 *   1. The SQL query is maintained alongside the type (same file/owner).
 *   2. Each row is validated with a runtime schema (Zod, etc.) before use.
 *   3. The cast is visible at the call site so reviewers can audit it.
 */
export async function rawQueryAll<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const { text, values } = namedToPositional(sql, params);
  const tx = transactionContext.getStore();
  const result = await runRawQuery<T>(text, values, tx);
  return result.rows;
}

/**
 * Returns the current dialect.
 */
export function getActiveDialect() {
  return "postgresql" as const;
}

// --- Internal helpers ---

// `namedToPositional` lives in ./named-params (a pool-free module) so it can be
// reused by pure SQL builders and gated integration tests without importing the
// global connection pool. Re-exported here to preserve the historical import path.
export { namedToPositional } from "./named-params";
