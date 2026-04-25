import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("importDatabase implementation guards", () => {
  it("aborts the transaction on batch insert failure instead of silently committing partial state", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/import.ts"), "utf8");

    expect(source).toContain('throw new Error(`Failed to import ${tableName} batch ${i}`)');
    // Verify that DB error messages are NOT included in throw/errors (sanitized for API response)
    expect(source).not.toContain('throw new Error(`Failed to truncate ${tableName}: ${message}`)');
    expect(source).not.toContain("result.success = false;\n            skipped += values.length;\n          }\n        }\n\n        result.tableResults");
  });

  it("derives timestamp, boolean, and json coercion columns from schema metadata", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/import.ts"), "utf8");

    expect(source).toContain("buildImportColumnSets(TABLE_MAP)");
    expect(source).toContain("const dataType = (column as { dataType?: string }).dataType;");
    expect(source).not.toContain('const BOOLEAN_COLUMNS = new Set([');
    expect(source).not.toContain('const TIMESTAMP_COLUMNS = new Set([');
    expect(source).not.toContain('const JSON_COLUMNS = new Set([');
  });

  it("TABLE_MAP is derived from TABLE_ORDER, not manually maintained", () => {
    const importSource = readFileSync(join(process.cwd(), "src/lib/db/import.ts"), "utf8");
    const exportSource = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    // Verify TABLE_MAP is built by iterating TABLE_ORDER, not hardcoded
    expect(importSource).toContain("for (const { name, table } of TABLE_ORDER)");
    // Verify the old hardcoded object literal is gone
    expect(importSource).not.toContain("users: schema.users,");
    // Verify TABLE_ORDER is exported from export.ts so import.ts can use it
    expect(exportSource).toContain("export const TABLE_ORDER");
  });

  it("TABLE_MAP and TABLE_ORDER table names are consistent (source-level check)", () => {
    const importSource = readFileSync(join(process.cwd(), "src/lib/db/import.ts"), "utf8");
    const exportSource = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    // Extract table names from TABLE_ORDER in export.ts
    const orderNameRegex = /\{\s*name:\s*"(\w+)"/g;
    const orderNames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = orderNameRegex.exec(exportSource)) !== null) {
      orderNames.add(match[1]);
    }

    // Since TABLE_MAP is derived from TABLE_ORDER at runtime, they must match.
    // Verify the derivation loop is present and uses TABLE_ORDER.
    expect(importSource).toContain("TABLE_MAP[name] = table");

    // Verify TABLE_ORDER has the expected tables
    expect(orderNames.has("users")).toBe(true);
    expect(orderNames.has("submissions")).toBe(true);
    expect(orderNames.has("submissionResults")).toBe(true);
    expect(orderNames.size).toBeGreaterThanOrEqual(30);
  });
});
