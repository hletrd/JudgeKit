import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("backup/export docs consistency", () => {
  it("documents migrate export as POST with password confirmation", () => {
    const docs = read("docs/api.md");
    expect(docs).toContain("#### `POST /api/v1/admin/migrate/export`");
    expect(docs).toContain('{ "password": "string" }');
    expect(docs).toContain('redactionMode: "sanitized"');
    expect(docs).not.toContain("#### `GET /api/v1/admin/migrate/export`");
  });

  it("documents restore as full-fidelity-only for disaster recovery", () => {
    const docs = read("docs/api.md");
    const policy = read("docs/data-retention-policy.md");

    expect(docs).toContain("Portable sanitized exports are rejected here.");
    expect(policy).toContain("Sanitized exports are intentionally **not** accepted by the disaster-recovery restore route.");
  });

  it("uses ZIP backup downloads with JSON+ZIP restore inputs for PostgreSQL backups", () => {
    const component = read("src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx");
    const docs = read("docs/api.md");
    expect(component).toContain("judgekit-backup-${timestamp}.zip");
    expect(component).toContain('accept=".json,.zip,application/json,application/zip"');
    expect(docs).toContain("checksum manifest");
    expect(component).not.toContain(".sqlite");
  });

  it("describes the production database runtime as PostgreSQL-only", () => {
    const env = read(".env.production.example");
    expect(env).toContain("# Database (PostgreSQL runtime only)");
    expect(env).toContain("PLUGIN_CONFIG_ENCRYPTION_KEY=");
    expect(env).not.toContain("sqlite (default)");
  });
});
