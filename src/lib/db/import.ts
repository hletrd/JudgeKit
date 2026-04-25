/**
 * Portable database import engine.
 *
 * Imports data from a JudgeKitExport JSON into the current database,
 * handling type conversions between dialects.
 */

import { getTableColumns, sql } from "drizzle-orm";
import { db } from "./index";
import { validateExport, getTableOrder, getReversedTableOrder, TABLE_ORDER, type JudgeKitExport } from "./export";
import { logger } from "@/lib/logger";

/**
 * Map of logical table names to Drizzle table references.
 * Derived from TABLE_ORDER in export.ts so the two lists cannot drift.
 * If a table is added to the schema, it must be added to TABLE_ORDER in
 * export.ts — the import side will pick it up automatically.
 */
export const TABLE_MAP: Record<string, any> = {};
for (const { name, table } of TABLE_ORDER) {
  TABLE_MAP[name] = table;
}

function buildImportColumnSets(tableMap: Record<string, any>) {
  const timestampColumns = new Set<string>();
  const booleanColumns = new Set<string>();
  const jsonColumns = new Set<string>();

  for (const table of Object.values(tableMap)) {
    const columns = getTableColumns(table);
    for (const [columnName, column] of Object.entries(columns)) {
      const dataType = (column as { dataType?: string }).dataType;
      if (dataType === "date") {
        timestampColumns.add(columnName);
      } else if (dataType === "boolean") {
        booleanColumns.add(columnName);
      } else if (dataType === "json") {
        jsonColumns.add(columnName);
      }
    }
  }

  return {
    timestampColumns,
    booleanColumns,
    jsonColumns,
  };
}

const {
  timestampColumns: TIMESTAMP_COLUMNS,
  booleanColumns: BOOLEAN_COLUMNS,
  jsonColumns: JSON_COLUMNS,
} = buildImportColumnSets(TABLE_MAP);

export interface ImportResult {
  success: boolean;
  tablesImported: number;
  totalRowsImported: number;
  tableResults: Record<string, { imported: number; skipped: number }>;
  errors: string[];
  message?: string;
}

/**
 * Convert a portable value back to the target dialect's format.
 */
function convertValue(val: unknown, colName: string): unknown {
  if (val === null || val === undefined) return null;

  // Timestamp columns: ISO string → Date
  if (TIMESTAMP_COLUMNS.has(colName) && typeof val === "string") {
    const date = new Date(val);
    if (isNaN(date.getTime())) return val;
    return date;
  }

  // Boolean columns
  if (BOOLEAN_COLUMNS.has(colName)) {
    return Boolean(val);
  }

  // JSON columns: parse string to native object for PostgreSQL jsonb
  if (JSON_COLUMNS.has(colName)) {
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch (err) { logger.debug({ err, colName }, "[import] JSON parse failed for column, returning raw value"); return val; }
    }
    return val;
  }

  return val;
}

/**
 * Import data from a JudgeKitExport into the current database.
 *
 * WARNING: This REPLACES all data in the target database.
 */
export async function importDatabase(data: JudgeKitExport): Promise<ImportResult> {
  // Validate first
  const validationErrors = validateExport(data);
  if (validationErrors.length > 0) {
    return {
      success: false,
      tablesImported: 0,
      totalRowsImported: 0,
      tableResults: {},
      errors: validationErrors,
    };
  }

  const result: ImportResult = {
    success: true,
    tablesImported: 0,
    totalRowsImported: 0,
    tableResults: {},
    errors: [],
  };

  try {
    // Wrap entire import in a single transaction for atomicity.
    // Note: FK constraints are NOT DEFERRABLE, so ordering relies on TABLE_ORDER
    // inserting parents before children. Do not reorder TABLE_ORDER entries.
    await db.transaction(async (tx) => {

      // Truncate all tables in reverse FK order (children first)
      const reverseOrder = getReversedTableOrder();
      for (const tableName of reverseOrder) {
        const table = TABLE_MAP[tableName];
        if (!table) continue;
        try {
          await tx.delete(table);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ tableName, err: message }, "Failed to truncate table during import");
          throw new Error(`Failed to truncate ${tableName}: ${message}`);
        }
      }

      // Import tables in FK order (parents first)
      const tableOrder = getTableOrder();
      for (const tableName of tableOrder) {
        const tableData = data.tables[tableName];
        if (!tableData || tableData.rowCount === 0) {
          result.tableResults[tableName] = { imported: 0, skipped: 0 };
          continue;
        }

        const table = TABLE_MAP[tableName];
        if (!table) {
          result.errors.push(`Unknown table in import: ${tableName}`);
          continue;
        }

        const { columns, rows } = tableData;
        let imported = 0;
        let skipped = 0;

        // Validate exported column names against the target schema to detect
        // schema drift. If the export was produced by a version with different
        // column ordering, the position-based mapping would silently corrupt
        // data. Catch this before inserting.
        const schemaColumns = new Set(Object.keys(getTableColumns(table)));
        const unknownColumns = columns.filter((col: string) => !schemaColumns.has(col));
        const missingColumns = [...schemaColumns].filter((col) => !columns.includes(col));
        if (unknownColumns.length > 0 || missingColumns.length > 0) {
          const details: string[] = [];
          if (unknownColumns.length > 0) {
            details.push(`unknown columns: ${unknownColumns.join(", ")}`);
          }
          if (missingColumns.length > 0) {
            details.push(`missing columns: ${missingColumns.join(", ")}`);
          }
          const msg = `${tableName}: column mismatch — ${details.join("; ")}`;
          logger.warn({ tableName, unknownColumns, missingColumns }, "[import] schema drift detected");
          result.errors.push(msg);
          // Continue importing other tables but mark this one as failed
          result.tableResults[tableName] = { imported: 0, skipped: rows.length };
          continue;
        }

        // Insert in batches of 100 to avoid parameter limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const values = batch.map((row) => {
            const obj: Record<string, unknown> = {};
            for (let j = 0; j < columns.length; j++) {
              obj[columns[j]] = convertValue(row[j], columns[j]);
            }
            return obj;
          });

          try {
            await tx.insert(table).values(values);
            imported += values.length;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ tableName, batch: i, err: message }, "Failed to insert batch");
            result.errors.push(`${tableName} batch ${i}: ${message}`);
            result.success = false;
            skipped += values.length;
            throw new Error(`Failed to import ${tableName} batch ${i}: ${message}`);
          }
        }

        result.tableResults[tableName] = { imported, skipped };
        result.tablesImported++;
        result.totalRowsImported += imported;
      }
    }); // constraints checked at COMMIT

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.success = false;
    result.errors.push(`Import failed: ${message}`);
    // Transaction was rolled back — no partial data exists in the database.
    // Clear stale tableResults that reflect in-transaction state that was never committed.
    result.tableResults = {};
    result.tablesImported = 0;
    result.totalRowsImported = 0;
    result.message = "Import failed and was rolled back. No data was changed. Check errors and retry.";
  }

  return result;
}

/**
 * Get a summary of the current database (table names and row counts).
 * Useful for pre-import comparison.
 */
export async function getDatabaseSummary(): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLE_MAP)) {
    try {
      const [row] = await db.select({ count: sql<number>`count(*)` }).from(table);
      summary[name] = Number(row?.count ?? 0);
    } catch (err) {
      logger.warn({ err, tableName: name }, "[import] failed to read row count for table summary");
      summary[name] = -1; // error reading
    }
  }
  return summary;
}
