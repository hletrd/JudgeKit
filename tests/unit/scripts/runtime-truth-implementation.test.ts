import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("runtime-truth implementation guards", () => {
  it("keeps backup and health scripts PostgreSQL-first by default", () => {
    const backupScript = read("scripts/backup-db.sh");
    const monitorScript = read("scripts/monitor-health.sh");

    expect(backupScript).toContain('DB_DIALECT="${DB_DIALECT:-postgresql}"');
    expect(backupScript).toContain("BACKUP_REMOTE");
    expect(backupScript).toContain("rclone copy");
    expect(monitorScript).toContain('DB_DIALECT="${DB_DIALECT:-postgresql}"');
    expect(monitorScript).toContain("judge_workers");
    expect(monitorScript).toContain("submissions WHERE status IN ('pending', 'queued', 'judging')");
    expect(monitorScript).toContain('HEALTH_WARN_QUEUE_DEPTH="${HEALTH_WARN_QUEUE_DEPTH:-50}"');
  });

  it("keeps SQLite backup paths explicitly historical", () => {
    const backupScript = read("scripts/backup-db.sh");
    const verifyScript = read("scripts/verify-db-backup.sh");
    const sqliteSmoke = read("scripts/test-backup.sh");

    expect(backupScript).toContain("Historical SQLite backup");
    expect(verifyScript).toContain("historical backups only");
    expect(sqliteSmoke).toContain("DB_DIALECT=sqlite");
  });

  it("keeps the bundled systemd backup unit aligned with PostgreSQL backup artifacts", () => {
    const service = read("scripts/online-judge-backup.service");
    const timer = read("scripts/online-judge-backup.timer");

    expect(service).toContain("Description=JudgeKit PostgreSQL backup");
    expect(service).toContain("DB_DIALECT=postgresql");
    expect(service).toContain(".sql.gz");
    expect(timer).toContain("Description=Run JudgeKit PostgreSQL backup every day");
  });

  it("does not describe export.ts as a multi-dialect runtime engine anymore", () => {
    const exportSource = read("src/lib/db/export.ts");

    expect(exportSource).toContain("PostgreSQL runtime export engine.");
    expect(exportSource).not.toContain("any supported dialect (SQLite, PostgreSQL, MySQL)");
  });
});
