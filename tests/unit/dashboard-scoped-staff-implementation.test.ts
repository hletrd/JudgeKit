import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("dashboard scoped staff implementation", () => {
  it("routes assignment-status reviewers to the staff dashboard instead of the student shell", () => {
    const source = read("src/app/(dashboard)/dashboard/page.tsx");

    expect(source).toContain(
      'const canReviewAssignments = caps.has("submissions.view_all") || caps.has("assignments.view_status");'
    );
    expect(source).toContain('const isInstructorView = canReviewAssignments && !caps.has("system.settings");');
    expect(source).toContain("{!canReviewAssignments && !isCandidateView && (");
    expect(source).not.toContain('{!caps.has("submissions.view_all") && !isCandidateView && (');
  });

  it("builds the instructor dashboard from assigned teaching groups, not only primary ownership", () => {
    const source = read("src/app/(dashboard)/dashboard/_components/instructor-dashboard.tsx");

    expect(source).toContain("getAssignedTeachingGroupIds(userId)");
    expect(source).toContain("inArrayOperator(groups.id, instructorGroupIds)");
    expect(source).not.toContain("where: eq(groups.instructorId, userId)");
  });
});
