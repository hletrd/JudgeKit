import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("select value contract implementation", () => {
  it("renders explicit selected labels for the known risky select call sites", () => {
    const codeTimeline = read("src/components/contest/code-timeline-panel.tsx");
    const recruitingInvitations = read("src/components/contest/recruiting-invitations-panel.tsx");
    const groupMembers = read("src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx");
    const systemSettings = read("src/app/(dashboard)/dashboard/admin/settings/system-settings-form.tsx");

    expect(codeTimeline).not.toContain("<SelectValue />");
    expect(codeTimeline).toContain("<SelectValue>{selectedProblemLabel}</SelectValue>");

    expect(recruitingInvitations).not.toContain("<SelectValue />");
    expect(recruitingInvitations).toContain("<SelectValue>{selectedStatusFilterLabel}</SelectValue>");

    expect(groupMembers).not.toContain("(() => { const s = currentAvailableStudents.find");
    expect(groupMembers).toContain("<SelectValue placeholder={t(\"availableStudentsPlaceholder\")}>{selectedStudentLabel}</SelectValue>");

    expect(systemSettings).not.toContain("<SelectValue />");
    expect(systemSettings).toContain("<SelectValue>{defaultLocaleLabel}</SelectValue>");
  });
});
