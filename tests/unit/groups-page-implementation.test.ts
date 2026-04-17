import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("groups page implementation", () => {
  it("surfaces the edit dialog from the groups index when group editing is allowed", () => {
    const source = read("src/app/(dashboard)/dashboard/groups/page.tsx");

    expect(source).toContain('import EditGroupDialog from "./edit-group-dialog"');
    expect(source).toContain("const canEditGroups =");
    expect(source).toContain("<EditGroupDialog");
    expect(source).toContain('caps.has("groups.edit")');
  });
});
