import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("exportDatabase implementation guards", () => {
  it("exports inside a repeatable-read transaction and orders chunked reads deterministically", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).toContain("await db.transaction(async (tx) => {");
    expect(source).toContain('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(source).toContain(".orderBy(...getOrderClauses(table, orderColumns))");
  });

  it("provides a streaming JSON serializer for large backups", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).toContain("export function streamDatabaseExport");
    expect(source).toContain("new ReadableStream");
    expect(source).toContain('controller.enqueue(encoder.encode("}}"))');
    expect(source).toContain("waitForReadableStreamDemand");
    expect(source).toContain('options.signal?.addEventListener("abort", abort, { once: true })');
    expect(source).toContain("controller.desiredSize <= 0");
    expect(source).toContain('"redactionMode":${JSON.stringify(redactionMode)}');
  });

  it("imports ALWAYS_REDACT and SANITIZED_COLUMNS from the centralized secrets registry", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    // Export imports redaction config from centralized registry instead of defining inline
    expect(source).toContain("@/lib/security/secrets");
    expect(source).toContain("EXPORT_SANITIZED_COLUMNS");
    expect(source).toContain("EXPORT_ALWAYS_REDACT_COLUMNS");

    // Sanitized export path must redact sensitive columns
    expect(source).toContain("EXPORT_SANITIZED_COLUMNS");
    expect(source).toContain("EXPORT_ALWAYS_REDACT_COLUMNS");
    expect(source).toContain("const redactionMode = getExportRedactionMode(options.sanitize)");
  });

  it("uses the streaming export helper in the migration script instead of materializing the whole export object", () => {
    const source = readFileSync(join(process.cwd(), "scripts/migrate-sqlite-to-pg.ts"), "utf8");

    expect(source).toContain("streamDatabaseExport");
    expect(source).not.toContain("const data = await exportDatabase()");
  });

  it("does not export the deprecated OOM-prone exportDatabase or createExportJsonStream functions", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).not.toContain("export function createExportJsonStream");
    expect(source).not.toContain("export async function exportDatabase");
    expect(source).not.toContain("async function selectTableChunks");
  });
});
