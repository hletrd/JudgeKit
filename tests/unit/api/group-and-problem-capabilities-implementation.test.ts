import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("group and problem route capability alignment", () => {
  it("uses capability checks for problem creation/listing and group creation/listing", () => {
    const problemsRoute = readFileSync(join(process.cwd(), "src/app/api/v1/problems/route.ts"), "utf8");
    const groupsRoute = readFileSync(join(process.cwd(), "src/app/api/v1/groups/route.ts"), "utf8");

    expect(problemsRoute).toContain('caps.has("problems.view_all")');
    expect(problemsRoute).toContain('caps.has("problems.create")');
    expect(problemsRoute).not.toContain("isAdmin(user.role)");
    expect(problemsRoute).not.toContain("isInstructor(user.role)");

    expect(groupsRoute).toContain('caps.has("groups.view_all")');
    expect(groupsRoute).toContain('caps.has("groups.create")');
    expect(groupsRoute).toContain("groupInstructors");
    expect(groupsRoute).not.toContain("isAdmin(user.role)");
    expect(groupsRoute).not.toContain("isInstructor(user.role)");
  });
});
