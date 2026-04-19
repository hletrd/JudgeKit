import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPORT_PATH = "src/lib/db/export.ts";

describe("export.ts sanitization", () => {
  it("defines SANITIZED_COLUMNS with entries for all sensitive tables", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");

    expect(source).toContain("SANITIZED_COLUMNS");
    expect(source).toContain("users:");
    expect(source).toContain("sessions:");
    expect(source).toContain("accounts:");
    expect(source).toContain("apiKeys:");
    expect(source).toContain("judgeWorkers:");
    expect(source).toContain("recruitingInvitations:");
    expect(source).toContain("contestAccessTokens:");
  });

  it("covers all required sensitive column names", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");

    expect(source).toContain("passwordHash");
    expect(source).toContain("sessionToken");
    expect(source).toContain("refresh_token");
    expect(source).toContain("access_token");
    expect(source).toContain("id_token");
    expect(source).toContain("encryptedKey");
    expect(source).toContain("secretToken");
    expect(source).toContain("secretTokenHash");
    expect(source).toContain("judgeClaimToken");
    // token appears in both recruitingInvitations and contestAccessTokens
    expect(source).toMatch(/"token"/);
  });

  it("streamDatabaseExport accepts a sanitize option", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");
    expect(source).toMatch(/streamDatabaseExport\s*\([^)]*sanitize\??\s*:/);
  });

  it("records whether an export is sanitized or full-fidelity", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");
    expect(source).toContain('export type JudgeKitExportRedactionMode = "full-fidelity" | "sanitized"');
    expect(source).toContain('"redactionMode"');
    expect(source).toContain('return sanitize ? "sanitized" : "full-fidelity"');
  });

  it("streamDatabaseExport uses SANITIZED_COLUMNS when sanitize is true", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");
    expect(source).toContain("options.sanitize ? { ...SANITIZED_COLUMNS, ...ALWAYS_REDACT }");
  });

  it("does not export the deprecated OOM-prone exportDatabase function", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");
    expect(source).not.toContain("export async function exportDatabase");
  });
});
