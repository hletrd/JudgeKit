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
    expect(docs).not.toContain("#### `GET /api/v1/admin/migrate/export`");
  });

  it("uses JSON file extensions and filters for PostgreSQL backups", () => {
    const component = read("src/app/(dashboard)/dashboard/admin/settings/database-backup-restore.tsx");
    expect(component).toContain("judgekit-backup-${timestamp}.json");
    expect(component).toContain('accept=".json,application/json"');
    expect(component).not.toContain(".sqlite");
  });

  it("describes the production database runtime as PostgreSQL-only", () => {
    const env = read(".env.production.example");
    expect(env).toContain("# Database (PostgreSQL runtime only)");
    expect(env).toContain("PLUGIN_CONFIG_ENCRYPTION_KEY=");
    expect(env).not.toContain("sqlite (default)");
  });
});
