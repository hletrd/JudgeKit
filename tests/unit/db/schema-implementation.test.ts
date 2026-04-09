import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("database schema implementation guards", () => {
  it("avoids raw descending-index SQL that breaks drizzle-kit push introspection", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/schema.pg.ts"), "utf8");

    expect(source).toContain(
      'index("submissions_leaderboard_idx").on(table.assignmentId, table.userId, table.submittedAt)'
    );
    expect(source).not.toContain('sql`desc(${table.submittedAt})`');
  });
});
