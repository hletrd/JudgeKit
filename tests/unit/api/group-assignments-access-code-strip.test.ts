import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard for NEW-H2: the contest `accessCode` must be stripped from
 * the assignments list and detail GET responses for non-managers. Behavioral
 * coverage of the redeem path lives in tests/unit/assignments/access-codes.test.ts;
 * this test pins the strip logic into both routes so it cannot be silently removed.
 */
describe("assignments GET accessCode strip (NEW-H2)", () => {
  const listRoute = readFileSync(
    "src/app/api/v1/groups/[id]/assignments/route.ts",
    "utf8",
  );
  const detailRoute = readFileSync(
    "src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts",
    "utf8",
  );

  it("list route gates accessCode on canManageGroupResourcesAsync and strips it", () => {
    expect(listRoute).toContain("canManageGroupResourcesAsync(");
    expect(listRoute).toContain("columns: { id: true, instructorId: true }");
    expect(listRoute).toMatch(/if \(!canManage\)[\s\S]*delete .*accessCode/);
  });

  it("detail route gates accessCode on canManageGroupResourcesAsync and strips it", () => {
    expect(detailRoute).toContain("canManageGroupResourcesAsync(");
    expect(detailRoute).toMatch(/if \(!canManage\)[\s\S]*delete .*accessCode/);
  });
});
