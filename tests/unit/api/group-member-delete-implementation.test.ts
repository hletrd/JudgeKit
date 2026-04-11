import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("group member delete implementation guards", () => {
  it("locks the enrollment row inside the final transaction before removal", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/members/[userId]/route.ts"),
      "utf8"
    );

    expect(source).toContain(".from(enrollments)");
    expect(source).toContain('.for("update")');
    expect(source).toContain('return { error: "studentEnrollmentNotFound" as const };');
    expect(source).toContain("return { member };");
  });
});
