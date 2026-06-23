import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("submission create route implementation", () => {
  it("uses targeted indexed count queries for per-user submission limits", () => {
    const route = read("src/app/api/v1/submissions/route.ts");
    const schema = read("src/lib/db/schema.pg.ts");
    const migration = read("drizzle/pg/0036_submission_create_indexes.sql");

    expect(route).not.toContain("SUM(CASE WHEN");
    expect(route).toContain("gt(submissions.submittedAt, oneMinuteAgo)");
    expect(route).toContain("inArray(submissions.status, [\"pending\", \"judging\", \"queued\"])");
    expect(schema).toContain("submissions_user_submitted_at_idx");
    expect(schema).toContain("submissions_user_status_idx");
    expect(migration).toContain(
      'CREATE INDEX "submissions_user_submitted_at_idx" ON "submissions" USING btree ' +
        '("user_id","submitted_at")'
    );
    expect(migration).toContain(
      'CREATE INDEX "submissions_user_status_idx" ON "submissions" USING btree ' +
        '("user_id","status")'
    );
  });
});
