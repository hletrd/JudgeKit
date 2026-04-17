import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("group member management capability implementation", () => {
  it("uses the narrower group-member management helper on routes and group detail UI", () => {
    const membersRoute = read("src/app/api/v1/groups/[id]/members/route.ts");
    const memberDeleteRoute = read("src/app/api/v1/groups/[id]/members/[userId]/route.ts");
    const bulkRoute = read("src/app/api/v1/groups/[id]/members/bulk/route.ts");
    const groupPage = read("src/app/(dashboard)/dashboard/groups/[id]/page.tsx");

    expect(membersRoute).toContain("canManageGroupMembersAsync(");
    expect(memberDeleteRoute).toContain("canManageGroupMembersAsync(");
    expect(bulkRoute).toContain("canManageGroupMembersAsync(");
    expect(groupPage).toContain("canManageGroupMembersAsync(");
    expect(groupPage).toContain("canManage={canManageMembers}");
  });
});
