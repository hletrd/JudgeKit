import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("raw query usage implementation guards", () => {
  it("keeps contest access raw queries parameterized instead of interpolating request values", () => {
    const leaderboardRoute = read("src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts");
    const antiCheatRoute = read("src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts");

    expect(leaderboardRoute).toContain("WHERE a.id = @assignmentId");
    expect(leaderboardRoute).toContain("{ groupId: assignment.groupId, userId: user.id, assignmentId }");
    expect(antiCheatRoute).toContain("WHERE group_id = @groupId AND user_id = @userId");
    expect(antiCheatRoute).toContain("{ groupId: assignment.groupId, userId: user.id, assignmentId }");
    expect(leaderboardRoute).not.toContain("${assignmentId}");
  });

  it("keeps the raw query helper on positional parameters for PostgreSQL", async () => {
    const helper = read("src/lib/db/queries.ts");
    // The named→positional translation lives in the pool-free named-params
    // module (imported + re-exported by queries.ts) so pure SQL builders and
    // gated integration tests can use it without importing the global pool.
    // The SQL-injection guarantee is unchanged: parameters stay positional and
    // are never string-interpolated into the query text.
    const namedParams = read("src/lib/db/named-params.ts");

    expect(namedParams).toContain("@([a-zA-Z_]\\w*)");
    expect(namedParams).toContain("return `$${idx + 1}`");
    // queries.ts must still route every raw query through the translator and
    // execute it with parameterized values.
    expect(helper).toContain("namedToPositional");
    expect(helper).toContain("pool.query(text, values)");
  });
});
