import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("groups page implementation", () => {
  it("surfaces the edit dialog from the groups index when group editing is allowed", () => {
    const source = read("src/app/(public)/groups/page.tsx");

    expect(source).toContain('import EditGroupDialog from "./edit-group-dialog"');
    expect(source).toContain("const canViewAllGroups = caps.has(\"groups.view_all\")");
    expect(source).toContain("const canCreateGroups = caps.has(\"groups.create\")");
    expect(source).toContain("const canEditGroups = caps.has(\"groups.edit\")");
    expect(source).toContain("<EditGroupDialog");
    expect(source).toContain('caps.has("groups.edit")');
    expect(source).not.toContain("isInstructorOrAbove(");
    expect(source).not.toContain("canManageUsers(");
    expect(source).toContain('name="search"');
    expect(source).toContain('t("searchLabel")');
    expect(source).toContain('t("searchPlaceholder")');
    expect(source).toContain('params.set("search", searchQuery)');
    expect(source).toContain("GROUP_STATE_FILTER_VALUES");
    expect(source).toContain('name="state"');
    expect(source).toContain('t("stateFilterLabel")');
    expect(source).toContain('t("allStates")');
    expect(source).toContain('if (stateFilter !== "all") params.set("state", stateFilter)');
  });
});
