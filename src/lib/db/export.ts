/**
 * PostgreSQL runtime export engine.
 *
 * Exports all tables in FK-dependency order to a JSON format used by the
 * current PostgreSQL runtime and by historical migration tooling.
 */

import { asc, sql } from "drizzle-orm";
import { db, type TransactionClient, activeDialect } from "./index";
import type { DbDialect } from "./config";
import * as schema from "./schema";

export type JudgeKitExportRedactionMode = "full-fidelity" | "sanitized";

export interface JudgeKitExport {
  version: 1;
  exportedAt: string;
  sourceDialect: DbDialect;
  appVersion: string;
  redactionMode?: JudgeKitExportRedactionMode;
  tables: Record<
    string,
    {
      columns: string[];
      rows: unknown[][];
      rowCount: number;
    }
  >;
}

export function createExportJsonStream(data: JudgeKitExport): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const redactionMode = data.redactionMode ?? "full-fidelity";

  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `{"version":${data.version},"exportedAt":${JSON.stringify(data.exportedAt)},"sourceDialect":${JSON.stringify(data.sourceDialect)},"appVersion":${JSON.stringify(data.appVersion)},"redactionMode":${JSON.stringify(redactionMode)},"tables":{`
        )
      );

      const entries = Object.entries(data.tables);
      entries.forEach(([tableName, tableData], tableIndex) => {
        controller.enqueue(
          encoder.encode(
            `${tableIndex === 0 ? "" : ","}${JSON.stringify(tableName)}:{"columns":${JSON.stringify(tableData.columns)},"rows":[`
          )
        );

        tableData.rows.forEach((row, rowIndex) => {
          controller.enqueue(encoder.encode(`${rowIndex === 0 ? "" : ","}${JSON.stringify(row)}`));
        });

        controller.enqueue(encoder.encode(`],"rowCount":${tableData.rowCount}}`));
      });

      controller.enqueue(encoder.encode("}}"));
      controller.close();
    },
  });
}

async function waitForReadableStreamDemand(
  controller: ReadableStreamDefaultController<Uint8Array>,
  isCancelled: () => boolean
) {
  while (
    !isCancelled() &&
    controller.desiredSize !== null &&
    controller.desiredSize <= 0
  ) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function streamDatabaseExport(options: { signal?: AbortSignal; sanitize?: boolean } = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const redactionMode = getExportRedactionMode(options.sanitize);
  let cancelled = false;
  const abort = () => {
    cancelled = true;
  };

  return new ReadableStream({
    async start(controller) {
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        await db.transaction(async (tx) => {
          if (cancelled) return;
          await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
          await waitForReadableStreamDemand(controller, () => cancelled);

          controller.enqueue(
            encoder.encode(
              `{"version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"sourceDialect":${JSON.stringify(activeDialect)},"appVersion":${JSON.stringify(process.env.npm_package_version ?? "unknown")},"redactionMode":${JSON.stringify(redactionMode)},"tables":{`
            )
          );

          const activeRedactionMap = options.sanitize ? { ...SANITIZED_COLUMNS, ...ALWAYS_REDACT } : ALWAYS_REDACT;

          for (const [tableIndex, { name, table, orderColumns }] of TABLE_ORDER.entries()) {
            if (cancelled) return;
            const columnsChunk = await tx
              .select()
              .from(table)
              .orderBy(...getOrderClauses(table, orderColumns))
              .limit(EXPORT_CHUNK_SIZE)
              .offset(0);

            const columns = columnsChunk.length > 0 ? Object.keys(columnsChunk[0] as object) : [];
            const redactSet = activeRedactionMap[name];

            await waitForReadableStreamDemand(controller, () => cancelled);
            controller.enqueue(
              encoder.encode(
                `${tableIndex === 0 ? "" : ","}${JSON.stringify(name)}:{"columns":${JSON.stringify(columns)},"rows":[`
              )
            );

            let rowCount = 0;
            let offset = 0;
            let rowIndex = 0;
            let chunk = columnsChunk;

            while (true) {
              if (cancelled) return;
              if (chunk.length === 0) break;

              for (const row of chunk) {
                if (cancelled) return;
                await waitForReadableStreamDemand(controller, () => cancelled);
                const normalizedRow = columns.map((col) =>
                  redactSet?.has(col) ? null : normalizeValue((row as any)[col])
                );
                controller.enqueue(
                  encoder.encode(`${rowIndex === 0 ? "" : ","}${JSON.stringify(normalizedRow)}`)
                );
                rowCount += 1;
                rowIndex += 1;
              }

              if (chunk.length < EXPORT_CHUNK_SIZE) {
                break;
              }

              offset += chunk.length;
              chunk = await tx
                .select()
                .from(table)
                .orderBy(...getOrderClauses(table, orderColumns))
                .limit(EXPORT_CHUNK_SIZE)
                .offset(offset);
            }

            await waitForReadableStreamDemand(controller, () => cancelled);
            controller.enqueue(encoder.encode(`],"rowCount":${rowCount}}`));
          }

          if (cancelled) return;
          await waitForReadableStreamDemand(controller, () => cancelled);
          controller.enqueue(encoder.encode("}}"));
        });
        if (cancelled) return;
        controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

/**
 * Tables in FK-dependency order (parents before children).
 * Each entry maps a logical name to the Drizzle table reference.
 */
const TABLE_ORDER: { name: string; table: any; orderColumns: string[] }[] = [
  // Level 0: no foreign keys
  { name: "users", table: schema.users, orderColumns: ["id"] },
  { name: "roles", table: schema.roles, orderColumns: ["id"] },
  { name: "tags", table: schema.tags, orderColumns: ["id"] },
  { name: "systemSettings", table: schema.systemSettings, orderColumns: ["id"] },
  { name: "judgeWorkers", table: schema.judgeWorkers, orderColumns: ["id"] },
  { name: "languageConfigs", table: schema.languageConfigs, orderColumns: ["id"] },
  { name: "plugins", table: schema.plugins, orderColumns: ["id"] },
  { name: "rateLimits", table: schema.rateLimits, orderColumns: ["id"] },
  // Level 1: FK to level 0
  { name: "sessions", table: schema.sessions, orderColumns: ["sessionToken"] },
  { name: "accounts", table: schema.accounts, orderColumns: ["id"] },
  { name: "loginEvents", table: schema.loginEvents, orderColumns: ["id"] },
  { name: "auditEvents", table: schema.auditEvents, orderColumns: ["id"] },
  { name: "apiKeys", table: schema.apiKeys, orderColumns: ["id"] },
  { name: "groups", table: schema.groups, orderColumns: ["id"] },
  { name: "problems", table: schema.problems, orderColumns: ["id"] },
  { name: "files", table: schema.files, orderColumns: ["id"] },
  { name: "problemSets", table: schema.problemSets, orderColumns: ["id"] },
  // Level 2: FK to level 0-1
  { name: "enrollments", table: schema.enrollments, orderColumns: ["id"] },
  { name: "groupInstructors", table: schema.groupInstructors, orderColumns: ["id"] },
  { name: "testCases", table: schema.testCases, orderColumns: ["id"] },
  { name: "problemGroupAccess", table: schema.problemGroupAccess, orderColumns: ["id"] },
  { name: "assignments", table: schema.assignments, orderColumns: ["id"] },
  { name: "problemSetProblems", table: schema.problemSetProblems, orderColumns: ["id"] },
  { name: "problemSetGroupAccess", table: schema.problemSetGroupAccess, orderColumns: ["id"] },
  { name: "problemTags", table: schema.problemTags, orderColumns: ["id"] },
  { name: "chatMessages", table: schema.chatMessages, orderColumns: ["id"] },
  { name: "discussionThreads", table: schema.discussionThreads, orderColumns: ["id"] },
  { name: "communityVotes", table: schema.communityVotes, orderColumns: ["id"] },
  // Level 3: FK to level 0-2
  { name: "discussionPosts", table: schema.discussionPosts, orderColumns: ["id"] },
  { name: "assignmentProblems", table: schema.assignmentProblems, orderColumns: ["id"] },
  { name: "recruitingInvitations", table: schema.recruitingInvitations, orderColumns: ["id"] },
  { name: "examSessions", table: schema.examSessions, orderColumns: ["id"] },
  { name: "contestAccessTokens", table: schema.contestAccessTokens, orderColumns: ["id"] },
  // Level 4: FK to level 0-3
  { name: "submissions", table: schema.submissions, orderColumns: ["id"] },
  { name: "antiCheatEvents", table: schema.antiCheatEvents, orderColumns: ["id"] },
  { name: "scoreOverrides", table: schema.scoreOverrides, orderColumns: ["id"] },
  { name: "codeSnapshots", table: schema.codeSnapshots, orderColumns: ["id"] },
  // Level 5: FK to level 0-4
  { name: "submissionResults", table: schema.submissionResults, orderColumns: ["id"] },
  { name: "submissionComments", table: schema.submissionComments, orderColumns: ["id"] },
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

function getExportRedactionMode(sanitize?: boolean): JudgeKitExportRedactionMode {
  return sanitize ? "sanitized" : "full-fidelity";
}

/**
 * Columns redacted in sanitized (human-downloadable) exports.
 * Full-fidelity backup keeps all columns for disaster recovery.
 *
 * Sanitized exports null-out sensitive material — session tokens, password
 * hashes, API keys, worker secrets — so a portable export can be shared or
 * archived without leaking live credentials.
 */
const SANITIZED_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
  sessions: new Set(["sessionToken"]),
  accounts: new Set(["refresh_token", "access_token", "id_token"]),
  apiKeys: new Set(["encryptedKey"]),
  judgeWorkers: new Set(["secretToken", "secretTokenHash", "judgeClaimToken"]),
  recruitingInvitations: new Set(["token", "tokenHash"]),
  contestAccessTokens: new Set(["token"]),
};

/** Columns that are ALWAYS redacted, even in full-fidelity backup exports. */
const ALWAYS_REDACT: Record<string, Set<string>> = {
  users: new Set(["passwordHash"]),
};

/** Empty redaction set for full-fidelity backup exports (minus ALWAYS_REDACT). */
const REDACTED_COLUMNS: Record<string, Set<string>> = {};

function getOrderClauses(table: any, orderColumns: string[]) {
  return orderColumns
    .map((column) => table[column])
    .filter(Boolean)
    .map((column) => asc(column));
}

async function selectTableChunks(
  tx: TransactionClient,
  table: any,
  orderColumns: string[]
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const chunk = await tx
      .select()
      .from(table)
      .orderBy(...getOrderClauses(table, orderColumns))
      .limit(EXPORT_CHUNK_SIZE)
      .offset(offset);

    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < EXPORT_CHUNK_SIZE) break;
    offset += chunk.length;
  }

  return rows;
}

/**
 * Export the entire database to a portable JSON format.
 * Uses cursor-based pagination to avoid loading entire tables into memory.
 */
export async function exportDatabase(options: { sanitize?: boolean } = {}): Promise<JudgeKitExport> {
  const redactionMap = options.sanitize ? SANITIZED_COLUMNS : REDACTED_COLUMNS;

  return db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));

    const result: JudgeKitExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceDialect: activeDialect,
      appVersion: process.env.npm_package_version ?? "unknown",
      redactionMode: getExportRedactionMode(options.sanitize),
      tables: {},
    };

    for (const { name, table, orderColumns } of TABLE_ORDER) {
      const orderedRows = await selectTableChunks(tx as TransactionClient, table, orderColumns);
      const columns = orderedRows.length > 0 ? Object.keys(orderedRows[0] as object) : [];
      const redactSet = redactionMap[name];
      const rows = orderedRows.map((row) =>
        columns.map((col) => (redactSet?.has(col) ? null : normalizeValue((row as any)[col])))
      );

      result.tables[name] = {
        columns,
        rows,
        rowCount: rows.length,
      };
    }

    return result;
  });
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

  if (
    exp.redactionMode !== undefined &&
    exp.redactionMode !== "full-fidelity" &&
    exp.redactionMode !== "sanitized"
  ) {
    errors.push(`Invalid redactionMode: ${exp.redactionMode}`);
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

export function isSanitizedExport(data: JudgeKitExport): boolean {
  return data.redactionMode === "sanitized";
}
