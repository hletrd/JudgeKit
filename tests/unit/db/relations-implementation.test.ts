import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("relations.pg implementation guards", () => {
  it("defines the missing high-value relations called out by the review", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/db/relations.pg.ts"), "utf8");

    expect(source).toContain("groupInstructorAssignments: many(groupInstructors)");
    expect(source).toContain("createdApiKeys: many(apiKeys)");
    expect(source).toContain("createdRecruitingInvitations: many(recruitingInvitations)");
    expect(source).toContain("codeSnapshots: many(codeSnapshots)");
    expect(source).toContain("groupInstructors: many(groupInstructors)");
    expect(source).toContain("files: many(files)");
    expect(source).toContain("problemTags: many(problemTags)");
    expect(source).toContain("recruitingInvitations: many(recruitingInvitations)");
    expect(source).toContain("creator: one(users, {");
    expect(source).toContain("problem: one(problems, {");
  });
});
