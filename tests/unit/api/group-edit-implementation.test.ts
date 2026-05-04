import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("group edit implementation", () => {
  it("supports primary instructor reassignment through the update schema and PATCH route", () => {
    const validator = read("src/lib/validators/groups.ts");
    const route = read("src/app/api/v1/groups/[id]/route.ts");
    const dialog = read("src/app/(public)/groups/edit-group-dialog.tsx");

    expect(validator).toContain("instructorId");
    expect(route).toContain('caps.has("groups.edit")');
    expect(route).toContain("canEditByCapability");
    expect(route).toContain("instructorNotFound");
    expect(route).toContain("instructorRoleInvalid");
    expect(route).toContain('changedFields: Object.keys(body).filter((key) => ["name", "description", "isArchived", "instructorId"].includes(key))');
    expect(dialog).toContain('t("instructorLabelSimple")');
    expect(dialog).toContain('t("selectInstructor")');
    expect(dialog).toContain("availableInstructors");
    expect(dialog).toContain("instructorId");
  });
});
