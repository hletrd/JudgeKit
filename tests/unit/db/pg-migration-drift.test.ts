import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readPgMigrationSql() {
  const dir = join(process.cwd(), "drizzle/pg");
  const journalPath = join(dir, "meta/_journal.json");
  const journalEntries = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: Array<{ tag?: string }>;
  };
  const journalFiles = (journalEntries.entries ?? [])
    .map((entry) => entry.tag)
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => `${tag}.sql`);
  const discoveredFiles = readdirSync(dir).filter((file) => file.endsWith(".sql"));

  return Array.from(new Set([...journalFiles, ...discoveredFiles]))
    .filter((file) => existsSync(join(dir, file)))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n");
}

describe("PostgreSQL migration drift guards", () => {
  it("uses idempotent DDL for mixed-state deploy safety", () => {
    const sql = readPgMigrationSql();

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "code_snapshots"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "hide_scores_from_candidates"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "problem_id"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "submissions_leaderboard_idx"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "users_lower_username_idx"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "files_problem_id_idx"/);
  });

  it("includes the leaderboard and lookup indexes defined in the runtime schema", () => {
    const sql = readPgMigrationSql();

    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "submissions_leaderboard_idx"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "users_lower_username_idx"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "files_problem_id_idx"/);
  });

  it("includes the hide_scores_from_candidates assignment column", () => {
    const sql = readPgMigrationSql();

    expect(sql).toMatch(/hide_scores_from_candidates/);
  });

  it("captures the non-index drift reconciliations from the runtime schema", () => {
    const sql = readPgMigrationSql();

    expect(sql).toMatch(/recruiting_invitations_created_by_users_id_fk/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "rate_limits_last_attempt_idx"/);
    expect(sql).toMatch(/ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE\("name"\)/);
  });

  it("fails with a deterministic message when duplicate tag names exist", () => {
    const sql = readPgMigrationSql();

    expect(sql).toMatch(/Cannot add tags_name_unique: duplicate tag names exist/);
    expect(sql).toMatch(/Deduplicate rows in the tags table before applying this migration/);
  });
});
