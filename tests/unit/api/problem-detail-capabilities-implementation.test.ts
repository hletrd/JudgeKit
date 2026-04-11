import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("problem detail route capability guards", () => {
  it("uses problem capabilities for privileged edit/delete paths and keeps author access", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/problems/[id]/route.ts"),
      "utf8"
    );

    expect(source).toContain('caps.has("problems.edit")');
    expect(source).toContain('caps.has("problems.delete")');
    expect(source).toContain("problem.authorId === user.id");
    expect(source).not.toContain("isAdmin(user.role)");
  });
});
