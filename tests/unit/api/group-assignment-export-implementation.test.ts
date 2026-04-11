import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("group assignment export capability guard", () => {
  it("uses canManageGroupResourcesAsync instead of built-in admin/instructor checks", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts"),
      "utf8"
    );

    expect(source).toContain("canManageGroupResourcesAsync(");
    expect(source).not.toContain("isInstructor(user.role)");
    expect(source).not.toContain("isAdmin(user.role)");
  });
});
