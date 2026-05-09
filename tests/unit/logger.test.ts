import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";
import {
  LOGGER_REDACT_PATHS,
  EXPORT_SANITIZED_COLUMNS,
  EXPORT_ALWAYS_REDACT_COLUMNS,
} from "@/lib/security/secrets";

function waitForFlush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("logger redaction", () => {
  it("redacts bearer auth and password-like fields from structured logs", async () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk.toString();
    });

    const logger = createLogger(stream);
    logger.info({
      headers: { authorization: "Bearer super-secret-token" },
      password: "super-secret-password",
      workerSecret: "worker-secret-value",
      nested: {
        note: "still-visible",
      },
    }, "structured log");

    await waitForFlush();

    const line = output.trim();
    expect(line).not.toContain("super-secret-token");
    expect(line).not.toContain("super-secret-password");
    expect(line).not.toContain("worker-secret-value");

    const parsed = JSON.parse(line) as {
      headers: { authorization: string };
      password: string;
      workerSecret: string;
      nested: { note: string };
    };

    expect(parsed.headers.authorization).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.workerSecret).toBe("[REDACTED]");
    expect(parsed.nested.note).toBe("still-visible");
  });
});

describe("REDACT_PATHS coverage", () => {
  const LOGGER_PATH = "src/lib/logger.ts";
  const EXPORT_PATH = "src/lib/db/export.ts";

  /**
   * Secret columns that must be covered by logger REDACT_PATHS.
   * Derived from EXPORT_SANITIZED_COLUMNS + EXPORT_ALWAYS_REDACT_COLUMNS,
   * plus known secret fields that are handled in plaintext before
   * encryption (e.g. hcaptchaSecret in system settings).
   */
  const REQUIRED_REDACT_ENTRIES = [
    // From EXPORT_SANITIZED_COLUMNS / EXPORT_ALWAYS_REDACT_COLUMNS
    "passwordHash",
    "sessionToken",
    "encryptedKey",
    // Known secret fields handled in plaintext before encryption
    "hcaptchaSecret",
    // Auth-related secrets
    "judgeClaimToken",
    "access_token",
    "refresh_token",
    "id_token",
  ];

  it("includes all known secret column names in REDACT_PATHS", () => {
    for (const entry of REQUIRED_REDACT_ENTRIES) {
      expect(
        LOGGER_REDACT_PATHS.includes(entry),
        `REDACT_PATHS should include "${entry}"`
      ).toBe(true);
    }
  });

  it("includes body-prefixed variants for form-submitted secrets", () => {
    // Secrets that arrive via form body in server actions
    const bodyPrefixed = ["body.passwordHash", "body.hcaptchaSecret"];
    for (const entry of bodyPrefixed) {
      expect(
        LOGGER_REDACT_PATHS.includes(entry),
        `REDACT_PATHS should include "${entry}"`
      ).toBe(true);
    }
  });

  it("keeps export sanitization and REDACT_PATHS in sync", () => {
    const exportSource = readFileSync(join(process.cwd(), EXPORT_PATH), "utf8");

    // Columns that are hashes, not secrets — they don't need logger redaction
    // because they are one-way hashes (not reversible to plaintext).
    const HASH_COLUMNS = new Set(["secretTokenHash", "tokenHash"]);

    // Collect all non-hash column names from the centralized registry
    const allExportColumns = new Set<string>();
    for (const cols of Object.values(EXPORT_SANITIZED_COLUMNS)) {
      for (const col of cols) {
        if (!HASH_COLUMNS.has(col)) allExportColumns.add(col);
      }
    }
    for (const cols of Object.values(EXPORT_ALWAYS_REDACT_COLUMNS)) {
      for (const col of cols) {
        if (!HASH_COLUMNS.has(col)) allExportColumns.add(col);
      }
    }

    for (const name of allExportColumns) {
      const hasDirect = LOGGER_REDACT_PATHS.includes(name);
      expect(
        hasDirect,
        `REDACT_PATHS should cover export sanitization entry "${name}"`
      ).toBe(true);
    }
  });

  it("imports REDACT_PATHS from the centralized secrets registry", () => {
    const loggerSource = readFileSync(join(process.cwd(), LOGGER_PATH), "utf8");
    expect(loggerSource).toContain("@/lib/security/secrets");
    expect(loggerSource).toContain("LOGGER_REDACT_PATHS");
  });
});
