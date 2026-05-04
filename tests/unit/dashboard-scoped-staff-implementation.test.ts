import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("dashboard scoped staff implementation", () => {
  it("routes assignment-status reviewers to the staff dashboard instead of the student shell", () => {
    const source = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain(
      'const canReviewAssignments = caps.has("submissions.view_all") || caps.has("assignments.view_status");'
    );
    expect(source).toContain("const hasAdminWorkspace =");
    expect(source).toContain('const isInstructorView = canReviewAssignments && !hasAdminWorkspace;');
    expect(source).toContain("{!canReviewAssignments && !isCandidateView && !isAdminView && (");
    expect(source).not.toContain('{!caps.has("submissions.view_all") && !isCandidateView && (');
  });

  it("builds the instructor dashboard from assigned teaching groups, not only primary ownership", () => {
    const source = read("src/app/(public)/dashboard/_components/instructor-dashboard.tsx");
    const dashboardPage = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain("getAssignedTeachingGroupIds(userId)");
    expect(source).toContain("inArrayOperator(groups.id, instructorGroupIds)");
    expect(source).not.toContain("where: eq(groups.instructorId, userId)");
    expect(dashboardPage).toContain("const capabilityList = [...caps];");
    expect(dashboardPage).toContain("<InstructorDashboard userId={session.user.id} capabilities={capabilityList} />");
  });
});
