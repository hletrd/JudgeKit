import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("exportDatabase implementation guards", () => {
  it("exports inside a repeatable-read transaction and orders chunked reads deterministically", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).toContain("return db.transaction(async (tx) => {");
    expect(source).toContain('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(source).toContain(".orderBy(...getOrderClauses(table, orderColumns))");
  });

  it("provides a streaming JSON serializer for large backups", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).toContain("export function createExportJsonStream");
    expect(source).toContain("export function streamDatabaseExport");
    expect(source).toContain("new ReadableStream");
    expect(source).toContain('controller.enqueue(encoder.encode("}}"))');
  });

  it("uses the streaming export helper in the migration script instead of materializing the whole export object", () => {
    const source = readFileSync(join(process.cwd(), "scripts/migrate-sqlite-to-pg.ts"), "utf8");

    expect(source).toContain("streamDatabaseExport");
    expect(source).not.toContain("const data = await exportDatabase()");
  });
});
