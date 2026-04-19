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

  it("defines ALWAYS_REDACT for full-fidelity backups and SANITIZED_COLUMNS for portable exports", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/export.ts"), "utf8");

    // Full-fidelity backup always redacts passwordHash via ALWAYS_REDACT
    expect(source).toContain("const ALWAYS_REDACT: Record<string, Set<string>>");

    // Sanitized export path must redact sensitive columns
    expect(source).toContain("SANITIZED_COLUMNS");
    expect(source).toContain('users: new Set(["passwordHash"])');
    expect(source).toContain('sessions: new Set(["sessionToken"])');
    expect(source).toContain('apiKeys: new Set(["encryptedKey"])');
    expect(source).toContain('judgeWorkers: new Set(["secretToken", "secretTokenHash", "judgeClaimToken"])');
    expect(source).toContain('recruitingInvitations: new Set(["token", "tokenHash"])');
    expect(source).toContain('contestAccessTokens: new Set(["token"])');
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
