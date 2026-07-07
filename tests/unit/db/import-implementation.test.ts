import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/db/index", () => ({
  activeDialect: "postgresql",
  db: { transaction: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { buildImportColumnSets, convertValue, importDatabase, TABLE_MAP } from "@/lib/db/import";
import { getTableOrder, TABLE_ORDER } from "@/lib/db/export";
import { db } from "@/lib/db/index";
import * as schema from "@/lib/db/schema";

describe("importDatabase implementation guards", () => {
  it("aborts the transaction on batch insert failure instead of silently committing partial state", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/import.ts"), "utf8");

    expect(source).toContain('throw new Error(`Failed to import ${tableName} batch ${i}`)');
    // Verify that DB error messages are NOT included in throw/errors (sanitized for API response)
    expect(source).not.toContain('throw new Error(`Failed to truncate ${tableName}: ${message}`)');
    expect(source).not.toContain("result.success = false;\n            skipped += values.length;\n          }\n        }\n\n        result.tableResults");
  });

  it("derives timestamp, boolean, and json coercion columns from schema metadata", () => {
    const { timestampColumns, booleanColumns, jsonColumns } = buildImportColumnSets(TABLE_MAP);

    expect(timestampColumns.has("createdAt")).toBe(true);
    expect(timestampColumns.has("submittedAt")).toBe(true);
    expect(timestampColumns.has("judgeClaimedAt")).toBe(true);
    expect(booleanColumns.has("isActive")).toBe(true);
    expect(booleanColumns.has("showCompileOutput")).toBe(true);
    expect(booleanColumns.has("isEnabled")).toBe(true);
    expect(jsonColumns.has("functionSpec")).toBe(true);
    expect(jsonColumns.has("labels")).toBe(true);
    expect(jsonColumns.has("config")).toBe(true);
  });

  it("covers every schema pgTable in TABLE_ORDER (missing tables are cascade-wiped on restore)", () => {
    // A table absent from TABLE_ORDER is never exported, and on import the
    // truncate of its FK parents (users/assignments/problems) cascade-deletes
    // its live rows with NO compensating insert — unrecoverable data loss
    // (RPF cycle-1 CQ-CRIT: contestAnnouncements, contestClarifications,
    // sourceDrafts, passwordResetTokens, emailVerificationTokens).
    const INTENTIONALLY_EXCLUDED = new Set([
      // Ephemeral SSE slot coordination rows; meaningless outside the running
      // instance. Documented in src/lib/db/export.ts above TABLE_ORDER.
      "realtimeCoordination",
    ]);

    const schemaTableNames = Object.entries(schema)
      .filter(([, value]) => is(value, PgTable))
      .map(([exportName]) => exportName)
      .filter((exportName) => !INTENTIONALLY_EXCLUDED.has(exportName));

    const orderedNames = new Set(getTableOrder());
    const missing = schemaTableNames.filter((name) => !orderedNames.has(name));

    expect(missing).toEqual([]);
  });

  it("keeps TABLE_MAP and TABLE_ORDER consistent at runtime", () => {
    expect(Object.keys(TABLE_MAP).sort()).toEqual([...getTableOrder()].sort());

    for (const { name, table } of TABLE_ORDER) {
      expect(TABLE_MAP[name]).toBe(table);
    }
    expect(TABLE_MAP.users).toBeDefined();
    expect(TABLE_MAP.submissions).toBeDefined();
    expect(TABLE_MAP.submissionResults).toBeDefined();
  });
});

describe("convertValue boolean coercion", () => {
  it("returns false for falsy string/number forms", () => {
    expect(convertValue(false, "isActive")).toBe(false);
    expect(convertValue("false", "isActive")).toBe(false);
    expect(convertValue("False", "isActive")).toBe(false);
    expect(convertValue("FALSE", "isActive")).toBe(false);
    expect(convertValue(0, "isActive")).toBe(false);
    expect(convertValue("0", "isActive")).toBe(false);
    expect(convertValue("no", "isActive")).toBe(false);
    expect(convertValue("No", "isActive")).toBe(false);
    expect(convertValue("off", "isActive")).toBe(false);
    expect(convertValue("OFF", "isActive")).toBe(false);
  });

  it("returns true for truthy string/number forms", () => {
    expect(convertValue(true, "isActive")).toBe(true);
    expect(convertValue("true", "isActive")).toBe(true);
    expect(convertValue("True", "isActive")).toBe(true);
    expect(convertValue("TRUE", "isActive")).toBe(true);
    expect(convertValue(1, "isActive")).toBe(true);
    expect(convertValue("1", "isActive")).toBe(true);
    expect(convertValue("yes", "isActive")).toBe(true);
    expect(convertValue("Yes", "isActive")).toBe(true);
    expect(convertValue("on", "isActive")).toBe(true);
    expect(convertValue("ON", "isActive")).toBe(true);
  });

  it("falls back to Boolean() for unrecognized strings", () => {
    expect(convertValue("", "isActive")).toBe(false);
    expect(convertValue("maybe", "isActive")).toBe(true);
  });

  it("preserves non-boolean column behavior", () => {
    expect(convertValue("false", "title")).toBe("false");
    expect(convertValue("true", "description")).toBe("true");
    expect(convertValue(0, "score")).toBe(0);
    expect(convertValue(1, "score")).toBe(1);
  });
});
describe("importDatabase partial-export data-loss guard", () => {
  it("does NOT truncate tables absent from the export and records them in skippedTables", async () => {
    // Mock transaction: invoke the callback with a recording mock tx so we can
    // observe which tables are truncated. Cast the transaction binding to a
    // loose mock shape so the callback signature is not pinned to the real
    // Drizzle PgTransaction type (TS-only; the runtime binding is the vi.fn).
    const deleteMock = vi.fn();
    const mockTx = { delete: deleteMock };
    const transactionMock = db.transaction as unknown as {
      mockImplementation: (impl: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => unknown;
    };
    transactionMock.mockImplementation(async (cb) => cb(mockTx));

    // An export that carries ONLY the `users` table (rowCount 0 → insert loop
    // skips it too). Every other known table (e.g. examSessions) is absent.
    const partialExport = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      sourceDialect: "postgresql" as const,
      tables: {
        users: { columns: [], rows: [], rowCount: 0 },
      },
    };

    const result = await importDatabase(partialExport as never);

    // The absent table must NOT have been truncated.
    expect(deleteMock).not.toHaveBeenCalledWith(TABLE_MAP.examSessions);
    // The present table IS truncated (business as usual).
    expect(deleteMock).toHaveBeenCalledWith(TABLE_MAP.users);
    // The absent table is surfaced as a non-fatal skip, not an error.
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.skippedTables).toContain("examSessions");
    expect(result.skippedTables.length).toBeGreaterThan(0);
  });
});
