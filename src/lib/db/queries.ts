/**
 * Raw SQL query helpers for PostgreSQL.
 */

import { pool } from "./index";

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
  params?: Record<string, unknown>,
  client?: typeof pool,
): Promise<T | undefined> {
  const activeClient = client ?? pool;
  if (!activeClient) throw new Error("PostgreSQL pool not available");
  const { text, values } = namedToPositional(sql, params);
  const result = await activeClient.query(text, values);
  return result.rows[0] as T | undefined;
}

/**
 * Execute a raw SQL query that returns multiple rows.
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
  params?: Record<string, unknown>,
  client?: typeof pool,
): Promise<T[]> {
  const activeClient = client ?? pool;
  if (!activeClient) throw new Error("PostgreSQL pool not available");
  const { text, values } = namedToPositional(sql, params);
  const result = await activeClient.query(text, values);
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
 */
function namedToPositional(
  sql: string,
  params?: Record<string, unknown>
): { text: string; values: unknown[] } {
  if (!params) return { text: sql, values: [] };

  const values: unknown[] = [];
  const paramNames: string[] = [];
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    if (!/^[a-zA-Z_]\w*$/.test(name)) {
      throw new Error(`Invalid SQL parameter name: ${name}`);
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
  });
  return { text, values };
}
