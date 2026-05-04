import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("assignment duplication implementation", () => {
  it("lets the group detail page open the assignment form in duplication mode", () => {
    const pageSource = read("src/app/(public)/groups/[id]/page.tsx");
    const dialogSource = read("src/app/(public)/groups/[id]/assignment-form-dialog.tsx");

    expect(pageSource).toContain("seedAssignment={editorValue}");
    expect(dialogSource).toContain("seedAssignment?: AssignmentEditorValue");
    expect(dialogSource).toContain("const isDuplicating = Boolean(seedAssignment) && !isEditing");
    expect(dialogSource).toContain('t("assignmentDuplicateDialogTitle")');
    expect(dialogSource).toContain('"assignmentDuplicateSuccess"');
    expect(dialogSource).toContain('t("duplicateAssignment")');
  });
});
