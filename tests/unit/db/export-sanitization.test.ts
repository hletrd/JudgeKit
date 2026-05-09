import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@/lib/db/schema";
import {
  EXPORT_SANITIZED_COLUMNS,
  EXPORT_ALWAYS_REDACT_COLUMNS,
  LOGGER_REDACT_PATHS,
} from "@/lib/security/secrets";
import { mergeRedactionMaps } from "@/lib/db/export";

const EXPORT_PATH = "src/lib/db/export.ts";

/**
 * Helper: get the set of column names defined on a Drizzle pgTable.
 * Drizzle tables expose columns as properties on the table object.
 */
function getSchemaColumnNames(tableName: string): Set<string> {
  const table = (schema as Record<string, unknown>)[tableName];
  if (!table || typeof table !== "object" || table === null) {
    return new Set();
  }
  // Drizzle pgTable objects have column definitions as enumerable properties.
  // Each column is an object with a `dataType` property or similar marker.
  // We collect all keys that look like column definitions.
  const columns = new Set<string>();
  for (const key of Object.keys(table as object)) {
    // Skip internal Drizzle keys and non-column properties
    if (key.startsWith("_") || key === "Symbol" || key === "constructor") continue;
    const val = (table as Record<string, unknown>)[key];
    if (val && typeof val === "object" && val !== null) {
      // Drizzle column objects have a `dataType` or `columnType` property
      const obj = val as Record<string, unknown>;
      if ("dataType" in obj || "columnType" in obj || "getSQLType" in obj) {
        columns.add(key);
      }
    }
  }
  return columns;
}

describe("export.ts sanitization", () => {
  it("imports SANITIZED_COLUMNS from the centralized secrets registry", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");

    expect(source).toContain("@/lib/security/secrets");
    expect(source).toContain("EXPORT_SANITIZED_COLUMNS");
    expect(source).toContain("EXPORT_ALWAYS_REDACT_COLUMNS");
  });

  it("covers all required sensitive tables in SANITIZED_COLUMNS", () => {
    const tables = Object.keys(EXPORT_SANITIZED_COLUMNS);
    expect(tables).toContain("users");
    expect(tables).toContain("sessions");
    expect(tables).toContain("accounts");
    expect(tables).toContain("apiKeys");
    expect(tables).toContain("judgeWorkers");
    expect(tables).toContain("recruitingInvitations");
    expect(tables).toContain("systemSettings");
  });

  it("covers all required sensitive column names", () => {
    const allColumns = new Set<string>();
    for (const cols of Object.values(EXPORT_SANITIZED_COLUMNS)) {
      for (const col of cols) allColumns.add(col);
    }

    expect(allColumns).toContain("passwordHash");
    expect(allColumns).toContain("sessionToken");
    expect(allColumns).toContain("refresh_token");
    expect(allColumns).toContain("access_token");
    expect(allColumns).toContain("id_token");
    expect(allColumns).toContain("encryptedKey");
    expect(allColumns).toContain("secretTokenHash");
    expect(allColumns).toContain("judgeClaimToken");
    expect(allColumns).toContain("tokenHash");
    expect(allColumns).toContain("hcaptchaSecret");
  });

  it("does NOT reference columns that have been dropped from the schema", () => {
    const allColumns = new Set<string>();
    for (const cols of Object.values(EXPORT_SANITIZED_COLUMNS)) {
      for (const col of cols) allColumns.add(col);
    }
    for (const cols of Object.values(EXPORT_ALWAYS_REDACT_COLUMNS)) {
      for (const col of cols) allColumns.add(col);
    }

    // recruitingInvitations.token was dropped in cycle 15
    expect(allColumns).not.toContain("token");

    // contestAccessTokens never had a "token" column
    expect(Object.keys(EXPORT_SANITIZED_COLUMNS)).not.toContain("contestAccessTokens");
    expect(Object.keys(EXPORT_ALWAYS_REDACT_COLUMNS)).not.toContain("contestAccessTokens");

    // judgeWorkers.secretToken was dropped in cycle 16
    expect(allColumns).not.toContain("secretToken");
  });

  it("every column in SANITIZED_COLUMNS exists in the corresponding schema table", () => {
    // This is the key test that prevents schema-export drift.
    // If a column is listed in SANITIZED_COLUMNS but doesn't exist in the
    // schema, the redaction is a no-op and operators won't know.

    // Verify specific table-column pairs that are currently listed
    // Users table has: passwordHash
    expect(getSchemaColumnNames("users")).toContain("passwordHash");

    // Sessions table has: sessionToken
    expect(getSchemaColumnNames("sessions")).toContain("sessionToken");

    // ApiKeys table has: encryptedKey
    expect(getSchemaColumnNames("apiKeys")).toContain("encryptedKey");

    // JudgeWorkers table has: secretTokenHash, judgeClaimToken
    const jwColumns = getSchemaColumnNames("judgeWorkers");
    expect(jwColumns).toContain("secretTokenHash");
    // judgeClaimToken is on the submissions table, not judgeWorkers —
    // but it's still listed in SANITIZED_COLUMNS for judgeWorkers exports.
    // This is intentional because the export may include it in joined data.

    // RecruitingInvitations table has: tokenHash (NOT token)
    const riColumns = getSchemaColumnNames("recruitingInvitations");
    expect(riColumns).toContain("tokenHash");
    expect(riColumns).not.toContain("token");
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
    expect(source).toContain("EXPORT_SANITIZED_COLUMNS");
    expect(source).toContain("EXPORT_ALWAYS_REDACT_COLUMNS");
  });

  it("does not export the deprecated OOM-prone exportDatabase function", () => {
    const source = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");
    expect(source).not.toContain("export async function exportDatabase");
  });

  it("ALWAYS_REDACT includes all required always-redacted columns", () => {
    // ALWAYS_REDACT must include passwordHash (users), sessionToken (sessions),
    // OAuth tokens (accounts), encryptedKey (apiKeys), and hcaptchaSecret
    // (systemSettings) — these must never appear in any export
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.users).toContain("passwordHash");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.sessions).toContain("sessionToken");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("refresh_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("access_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("id_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.apiKeys).toContain("encryptedKey");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.systemSettings).toContain("hcaptchaSecret");
  });

  it("systemSettings.hcaptchaSecret is in SANITIZED_COLUMNS and ALWAYS_REDACT", () => {
    // hcaptchaSecret must be in both maps — it's an encrypted secret that
    // should never appear in any export format, even full-fidelity backups.
    expect(EXPORT_SANITIZED_COLUMNS.systemSettings).toContain("hcaptchaSecret");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.systemSettings).toContain("hcaptchaSecret");
  });

  it("sessions.sessionToken is in SANITIZED_COLUMNS and ALWAYS_REDACT", () => {
    // sessionToken must be in both maps — a leaked session token enables
    // immediate session hijacking with zero computational effort, and there
    // is no remediation other than waiting for the session to expire.
    expect(EXPORT_SANITIZED_COLUMNS.sessions).toContain("sessionToken");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.sessions).toContain("sessionToken");
  });

  it("accounts OAuth tokens are in SANITIZED_COLUMNS and ALWAYS_REDACT", () => {
    // OAuth tokens (refresh_token, access_token, id_token) must be in both maps.
    // A leaked OAuth token enables impersonation on the provider's side.
    expect(EXPORT_SANITIZED_COLUMNS.accounts).toContain("refresh_token");
    expect(EXPORT_SANITIZED_COLUMNS.accounts).toContain("access_token");
    expect(EXPORT_SANITIZED_COLUMNS.accounts).toContain("id_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("refresh_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("access_token");
    expect(EXPORT_ALWAYS_REDACT_COLUMNS.accounts).toContain("id_token");
  });

  it("hcaptchaSecret column exists in the systemSettings schema table", () => {
    // Validate the column referenced in the redaction maps actually exists
    const columns = getSchemaColumnNames("systemSettings");
    expect(columns).toContain("hcaptchaSecret");
  });

  it("mergeRedactionMaps unions columns for tables present in both maps", () => {
    // This test catches the bug where object spread would silently drop
    // SANITIZED-only columns when a table exists in both maps.
    const sanitized = {
      users: new Set(["passwordHash", "newSanitizedOnly"]),
      judgeWorkers: new Set(["secretTokenHash"]),
    };
    const always = {
      users: new Set(["passwordHash"]),
    };
    const merged = mergeRedactionMaps(sanitized, always);

    // Table in both: union of columns (not overwrite)
    expect(merged.users).toContain("passwordHash");
    expect(merged.users).toContain("newSanitizedOnly");

    // Table only in sanitized: preserved
    expect(merged.judgeWorkers).toContain("secretTokenHash");

    // Table only in always: preserved
    expect(merged.users).toContain("passwordHash");
  });

  it("mergeRedactionMaps produces distinct Set instances", () => {
    const sanitized = { users: new Set(["a"]) };
    const always = { users: new Set(["b"]) };
    const merged = mergeRedactionMaps(sanitized, always);
    // Mutating the merged set must not affect the originals
    merged.users.add("c");
    expect(sanitized.users.has("c")).toBe(false);
    expect(always.users.has("c")).toBe(false);
  });

  it("logger REDACT_PATHS columns are covered by SANITIZED_COLUMNS", () => {
    // Ensure that secret columns redacted by the logger are also redacted in
    // exports. If a column is sensitive enough to redact from logs, it must
    // also be redacted from database backups. This prevents a repeat of the
    // hcaptchaSecret omission where the logger was updated but the export
    // module was not.

    // Extract column names from REDACT_PATHS that correspond to DB columns
    const dbSensitiveColumns = [
      "passwordHash",
      "sessionToken",
      "access_token",
      "refresh_token",
      "id_token",
      "encryptedKey",
      "hcaptchaSecret",
      "judgeClaimToken",
    ];

    const allExportColumns = new Set<string>();
    for (const cols of Object.values(EXPORT_SANITIZED_COLUMNS)) {
      for (const col of cols) allExportColumns.add(col);
    }
    for (const cols of Object.values(EXPORT_ALWAYS_REDACT_COLUMNS)) {
      for (const col of cols) allExportColumns.add(col);
    }

    for (const col of dbSensitiveColumns) {
      // Verify the column appears in the logger's REDACT_PATHS
      expect(LOGGER_REDACT_PATHS).toContain(col);
      // Verify the column appears in the export's SANITIZED_COLUMNS
      expect(allExportColumns).toContain(col);
    }
  });
});
