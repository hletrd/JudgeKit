/**
 * Portable database export engine.
 *
 * Exports all tables in FK-dependency order to a JSON format that can
 * be imported into any supported dialect (SQLite, PostgreSQL, MySQL).
 */

import { db } from "./index";
import { activeDialect } from "./index";
import type { DbDialect } from "./config";
import * as schema from "./schema";

export interface JudgeKitExport {
  version: 1;
  exportedAt: string;
  sourceDialect: DbDialect;
  appVersion: string;
  tables: Record<
    string,
    {
      columns: string[];
      rows: unknown[][];
      rowCount: number;
    }
  >;
}

/**
 * Tables in FK-dependency order (parents before children).
 * Each entry maps a logical name to the Drizzle table reference.
 */
const TABLE_ORDER: { name: string; table: any }[] = [
  // Level 0: no foreign keys
  { name: "users", table: schema.users },
  { name: "roles", table: schema.roles },
  { name: "tags", table: schema.tags },
  { name: "systemSettings", table: schema.systemSettings },
  { name: "judgeWorkers", table: schema.judgeWorkers },
  { name: "languageConfigs", table: schema.languageConfigs },
  { name: "plugins", table: schema.plugins },
  { name: "rateLimits", table: schema.rateLimits },
  // Level 1: FK to level 0
  { name: "sessions", table: schema.sessions },
  { name: "accounts", table: schema.accounts },
  { name: "loginEvents", table: schema.loginEvents },
  { name: "auditEvents", table: schema.auditEvents },
  { name: "apiKeys", table: schema.apiKeys },
  { name: "groups", table: schema.groups },
  { name: "problems", table: schema.problems },
  { name: "files", table: schema.files },
  { name: "problemSets", table: schema.problemSets },
  // Level 2: FK to level 0-1
  { name: "enrollments", table: schema.enrollments },
  { name: "testCases", table: schema.testCases },
  { name: "problemGroupAccess", table: schema.problemGroupAccess },
  { name: "assignments", table: schema.assignments },
  { name: "problemSetProblems", table: schema.problemSetProblems },
  { name: "problemSetGroupAccess", table: schema.problemSetGroupAccess },
  { name: "problemTags", table: schema.problemTags },
  { name: "chatMessages", table: schema.chatMessages },
  // Level 3: FK to level 0-2
  { name: "assignmentProblems", table: schema.assignmentProblems },
  { name: "examSessions", table: schema.examSessions },
  { name: "contestAccessTokens", table: schema.contestAccessTokens },
  // Level 4: FK to level 0-3
  { name: "submissions", table: schema.submissions },
  { name: "antiCheatEvents", table: schema.antiCheatEvents },
  { name: "scoreOverrides", table: schema.scoreOverrides },
  // Level 5: FK to level 0-4
  { name: "submissionResults", table: schema.submissionResults },
  { name: "submissionComments", table: schema.submissionComments },
];

/** Returns the ordered table names for import/export */
export function getTableOrder(): string[] {
  return TABLE_ORDER.map((t) => t.name);
}

/** Returns the reversed table order (children before parents, for truncation) */
export function getReversedTableOrder(): string[] {
  return [...TABLE_ORDER].reverse().map((t) => t.name);
}

/**
 * Normalize a value for portable export.
 * - Date → ISO string
 * - boolean (true/false or 0/1) → true/false
 * - JSON string → parsed object
 * - null → null
 */
function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  // SQLite stores booleans as 0/1 integers — leave numbers as-is
  // since we can't distinguish boolean columns from integer columns
  // without schema metadata. The import side handles conversion.
  return val;
}

const EXPORT_CHUNK_SIZE = 1000;

/**
 * Columns that should be redacted (set to null) in exports for security.
 * Maps table name to column names to redact.
 */
const REDACTED_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
  judgeWorkers: new Set(["secretToken"]),
};

/**
 * Export the entire database to a portable JSON format.
 * Uses cursor-based pagination to avoid loading entire tables into memory.
 */
export async function exportDatabase(): Promise<JudgeKitExport> {
  const result: JudgeKitExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceDialect: activeDialect,
    appVersion: process.env.npm_package_version ?? "unknown",
    tables: {},
  };

  for (const { name, table } of TABLE_ORDER) {
    let columns: string[] | null = null;
    const allExportedRows: unknown[][] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(table)
        .limit(EXPORT_CHUNK_SIZE)
        .offset(offset);

      if (chunk.length === 0) break;

      if (!columns) {
        columns = Object.keys(chunk[0] as object);
      }

      const redactSet = REDACTED_COLUMNS[name];
      for (const row of chunk) {
        allExportedRows.push(
          columns.map((col) =>
            redactSet?.has(col) ? null : normalizeValue((row as any)[col])
          )
        );
      }

      if (chunk.length < EXPORT_CHUNK_SIZE) break;
      offset += EXPORT_CHUNK_SIZE;
    }

    result.tables[name] = {
      columns: columns ?? [],
      rows: allExportedRows,
      rowCount: allExportedRows.length,
    };
  }

  return result;
}

/**
 * Validate an export file structure without importing.
 * Returns validation errors (empty array = valid).
 */
export function validateExport(data: unknown): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push("Export data must be a JSON object");
    return errors;
  }

  const exp = data as Record<string, unknown>;

  if (exp.version !== 1) {
    errors.push(`Unsupported export version: ${exp.version} (expected 1)`);
  }

  if (!exp.exportedAt || typeof exp.exportedAt !== "string") {
    errors.push("Missing or invalid exportedAt field");
  }

  if (!exp.sourceDialect || !["sqlite", "postgresql", "mysql"].includes(exp.sourceDialect as string)) {
    errors.push(`Invalid sourceDialect: ${exp.sourceDialect}`);
  }

  if (!exp.tables || typeof exp.tables !== "object") {
    errors.push("Missing or invalid tables field");
    return errors;
  }

  const tables = exp.tables as Record<string, unknown>;
  const knownTables = new Set(TABLE_ORDER.map((t) => t.name));

  for (const [tableName, tableData] of Object.entries(tables)) {
    if (!knownTables.has(tableName)) {
      errors.push(`Unknown table: ${tableName}`);
      continue;
    }

    const td = tableData as Record<string, unknown>;
    if (!Array.isArray(td.columns)) {
      errors.push(`Table ${tableName}: missing columns array`);
    }
    if (!Array.isArray(td.rows)) {
      errors.push(`Table ${tableName}: missing rows array`);
    }
    if (typeof td.rowCount !== "number") {
      errors.push(`Table ${tableName}: missing rowCount`);
    } else if (Array.isArray(td.rows) && td.rows.length !== td.rowCount) {
      errors.push(`Table ${tableName}: rowCount (${td.rowCount}) doesn't match rows.length (${(td.rows as unknown[]).length})`);
    }
  }

  return errors;
}
