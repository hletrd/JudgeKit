import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RETENTION_PATH = "src/lib/data-retention.ts";
const MAINTENANCE_PATH = "src/lib/data-retention-maintenance.ts";

describe("data retention legal hold", () => {
  it("data-retention.ts exports isDataRetentionLegalHold", () => {
    const source = readFileSync(join(process.cwd(), RETENTION_PATH), "utf8");
    expect(source).toContain("export function isDataRetentionLegalHold");
  });

  it("isDataRetentionLegalHold reads the DATA_RETENTION_LEGAL_HOLD env var", () => {
    const source = readFileSync(join(process.cwd(), RETENTION_PATH), "utf8");
    expect(source).toContain('process.env.DATA_RETENTION_LEGAL_HOLD');
    // Must check for "true" or "1" string values
    expect(source).toContain('"true"');
    expect(source).toContain('"1"');
  });

  it("data-retention-maintenance.ts imports isDataRetentionLegalHold", () => {
    const source = readFileSync(join(process.cwd(), MAINTENANCE_PATH), "utf8");
    expect(source).toContain("isDataRetentionLegalHold");
    expect(source).toContain("@/lib/data-retention");
  });

  it("pruneSensitiveOperationalData checks legal hold before pruning", () => {
    const source = readFileSync(join(process.cwd(), MAINTENANCE_PATH), "utf8");
    // Accepts either the old constant or the new function pattern
    expect(source).toMatch(/(DATA_RETENTION_LEGAL_HOLD|isDataRetentionLegalHold)/);
    // The guard must appear inside pruneSensitiveOperationalData
    expect(source).toContain("pruneSensitiveOperationalData");
    expect(source).toMatch(/pruneSensitiveOperationalData[\s\S]*?(DATA_RETENTION_LEGAL_HOLD|isDataRetentionLegalHold)/);
  });

  it("maintenance function returns early when legal hold is active", () => {
    const source = readFileSync(join(process.cwd(), MAINTENANCE_PATH), "utf8");
    // early return pattern: if (isDataRetentionLegalHold()) { ... return; }
    // or legacy: if (DATA_RETENTION_LEGAL_HOLD) { ... return; } — deprecated constant removed
    expect(source).toMatch(/if\s*\(\s*(DATA_RETENTION_LEGAL_HOLD|isDataRetentionLegalHold\(\))\s*\)[\s\S]*?return/);
  });

  it("legal hold log message mentions skipping pruning", () => {
    const source = readFileSync(join(process.cwd(), MAINTENANCE_PATH), "utf8");
    expect(source).toMatch(/legal hold/i);
  });
});
