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
    expect(source).toContain("waitForReadableStreamDemand");
    expect(source).toContain('options.signal?.addEventListener("abort", abort, { once: true })');
    expect(source).toContain("controller.desiredSize <= 0");
  });

  it("does not redact required columns in restorable backups", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    expect(source).not.toContain('sessions: new Set(["sessionToken"])');
    expect(source).not.toContain('apiKeys: new Set(["encryptedKey", "keyHash"])');
    expect(source).not.toContain('recruitingInvitations: new Set(["token"])');
    expect(source).not.toContain('users: new Set(["passwordHash"])');
  });

  it("uses the streaming export helper in the migration script instead of materializing the whole export object", () => {
    const source = readFileSync(join(process.cwd(), "scripts/migrate-sqlite-to-pg.ts"), "utf8");

    expect(source).toContain("streamDatabaseExport");
    expect(source).not.toContain("const data = await exportDatabase()");
  });
});
