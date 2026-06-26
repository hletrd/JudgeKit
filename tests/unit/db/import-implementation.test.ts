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

import { buildImportColumnSets, importDatabase, TABLE_MAP } from "@/lib/db/import";
import { getTableOrder, TABLE_ORDER } from "@/lib/db/export";
import { db } from "@/lib/db/index";

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

describe("importDatabase partial-export data-loss guard", () => {
  it("does NOT truncate tables absent from the export and records them in skippedTables", async () => {
    // Mock transaction: invoke the callback with a recording mock tx so we can
    // observe which tables are truncated.
    const deleteMock = vi.fn();
    const mockTx = { delete: deleteMock };
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(mockTx),
    );

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
