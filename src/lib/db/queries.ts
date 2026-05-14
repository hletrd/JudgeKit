/**
 * Raw SQL query helpers for PostgreSQL.
 */

import { pool, transactionContext } from "./index";
import { logger } from "@/lib/logger";

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
 * Execute a raw SQL query that returns a single row.
 *
 * **WARNING:** This helper always runs on the global connection pool.
 * It cannot participate in Drizzle transactions. If you need raw SQL
 * inside a transaction, use Drizzle's `tx.execute()` or move the raw
 * query outside the transaction block.
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
  if (!pool) throw new Error("PostgreSQL pool not available");
  if (transactionContext.getStore() === true) {
    logger.warn("[rawQueryOne] Called inside a transaction callback — this runs on the global pool and does NOT participate in the Drizzle transaction. Use tx.execute() instead.");
  }
  const { text, values } = namedToPositional(sql, params);
  const result = await pool.query(text, values);
  return result.rows[0] as T | undefined;
}

/**
 * Execute a raw SQL query that returns multiple rows.
 *
 * **WARNING:** This helper always runs on the global connection pool.
 * It cannot participate in Drizzle transactions. If you need raw SQL
 * inside a transaction, use Drizzle's `tx.execute()` or move the raw
 * query outside the transaction block.
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
  if (!pool) throw new Error("PostgreSQL pool not available");
  if (transactionContext.getStore() === true) {
    logger.warn("[rawQueryAll] Called inside a transaction callback — this runs on the global pool and does NOT participate in the Drizzle transaction. Use tx.execute() instead.");
  }
  const { text, values } = namedToPositional(sql, params);
  const result = await pool.query(text, values);
  return result.rows as T[];
}

/**
 * Returns the current dialect.
 */
export function getActiveDialect() {
  return "postgresql" as const;
}

// --- Internal helpers ---

/**
 * Convert named parameters (@name) to PostgreSQL positional ($1, $2...).
 *
 * Skips @-patterns inside single-quoted and double-quoted string literals
 * to avoid incorrectly treating email addresses and other literal text as
 * parameters (e.g., 'user@example.com' must not extract "example").
 */
function namedToPositional(
  sql: string,
  params?: Record<string, unknown>
): { text: string; values: unknown[] } {
  if (!params) return { text: sql, values: [] };

  const values: unknown[] = [];
  const paramNames: string[] = [];

  // Match either a string literal (single or double quoted, with escaped quotes)
  // or a parameter placeholder. Only placeholders outside literals are replaced.
  const text = sql.replace(
    /('(?:[^']|'')*')|("(?:[^"]|"")*")|@([a-zA-Z_]\w*)/g,
    (match, _singleQuote, _doubleQuote, name) => {
      // If name is undefined, the match was a string literal — pass through unchanged
      if (name === undefined) {
        return match;
      }

      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        throw new Error(`Missing SQL parameter: ${name}`);
      }

      let idx = paramNames.indexOf(name);
      if (idx === -1) {
        paramNames.push(name);
        values.push(params[name]);
        idx = paramNames.length - 1;
      }
      return `$${idx + 1}`;
    }
  );
  return { text, values };
}
