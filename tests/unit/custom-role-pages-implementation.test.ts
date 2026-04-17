import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("custom-role page/runtime implementation guards", () => {
  it("removes built-in-only role assertions from custom-role-aware dashboard pages", () => {
    const pagePaths = [
      "src/app/(dashboard)/layout.tsx",
      "src/app/(dashboard)/dashboard/contests/page.tsx",
      "src/app/(dashboard)/dashboard/contests/[assignmentId]/analytics/page.tsx",
      "src/app/(dashboard)/dashboard/contests/[assignmentId]/participant/[userId]/page.tsx",
      "src/app/(dashboard)/dashboard/contests/[assignmentId]/page.tsx",
      "src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx",
      "src/app/(dashboard)/dashboard/groups/[id]/assignments/[assignmentId]/page.tsx",
      "src/app/(dashboard)/dashboard/groups/[id]/page.tsx",
      "src/app/(dashboard)/dashboard/problem-sets/page.tsx",
      "src/app/(dashboard)/dashboard/problem-sets/new/page.tsx",
      "src/app/(dashboard)/dashboard/problem-sets/[id]/page.tsx",
      "src/app/(dashboard)/dashboard/problems/page.tsx",
      "src/app/(dashboard)/dashboard/problems/[id]/page.tsx",
      "src/app/(dashboard)/dashboard/problems/[id]/edit/page.tsx",
    ];

    for (const pagePath of pagePaths) {
      expect(read(pagePath)).not.toContain("assertUserRole(");
    }
  });

  it("keeps contest discovery capability-aware for custom roles", () => {
    const contestsHelper = read("src/lib/assignments/contests.ts");

    expect(contestsHelper).toContain("resolveCapabilities");
    expect(contestsHelper).toContain("group_instructors gi");
    expect(contestsHelper).toContain("groups.view_all");
  });

  it("keeps problem and dashboard affordances capability-aware for custom roles", () => {
    const dashboardLayout = read("src/app/(dashboard)/layout.tsx");
    const problemSetsPage = read("src/app/(dashboard)/dashboard/problem-sets/page.tsx");
    const newProblemSetPage = read("src/app/(dashboard)/dashboard/problem-sets/new/page.tsx");
    const problemSetDetailPage = read("src/app/(dashboard)/dashboard/problem-sets/[id]/page.tsx");
    const problemsPage = read("src/app/(dashboard)/dashboard/problems/page.tsx");
    const problemDetail = read("src/app/(dashboard)/dashboard/problems/[id]/page.tsx");
    const publicPracticeDetail = read("src/app/(public)/practice/problems/[id]/page.tsx");

    expect(dashboardLayout).toContain('capsSet.has("assignments.view_status")');
    expect(dashboardLayout).not.toContain('session.user.role === "admin"');

    expect(problemSetsPage).toContain("getProblemSetCapabilityFlags");
    expect(problemSetsPage).not.toContain("isInstructorOrAbove");

    expect(newProblemSetPage).toContain("getProblemSetCapabilityFlags");
    expect(newProblemSetPage).not.toContain("isInstructorOrAbove");

    expect(problemSetDetailPage).toContain("getProblemSetCapabilityFlags");
    expect(problemSetDetailPage).toContain("canManageProblemSetForUser");
    expect(problemSetDetailPage).not.toContain("isInstructorOrAbove");

    expect(problemsPage).toContain("resolveCapabilities");
    expect(problemsPage).toContain('caps.has("problems.edit")');
    expect(problemsPage).toContain('caps.has("problems.view_all")');
    expect(problemsPage).not.toContain('session.user.role === "admin"');

    expect(problemDetail).toContain("resolveCapabilities");
    expect(problemDetail).toContain('caps.has("problems.edit")');
    expect(problemDetail).toContain('caps.has("assignments.view_status")');
    expect(problemDetail).not.toContain('session.user.role === "admin"');

    expect(publicPracticeDetail).toContain("resolveCapabilities");
    expect(publicPracticeDetail).toContain('caps.has("problems.edit")');
    expect(publicPracticeDetail).not.toContain('session.user.role === "admin"');
  });

  it("keeps admin user-management affordances capability-aware for custom roles", () => {
    const usersPage = read("src/app/(dashboard)/dashboard/admin/users/page.tsx");
    const userActions = read("src/app/(dashboard)/dashboard/admin/users/user-actions.tsx");
    const editDialog = read("src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx");

    expect(usersPage).toContain("canManageRoleAsync");
    expect(usersPage).toContain('caps.has("users.create")');
    expect(usersPage).toContain('caps.has("users.edit")');
    expect(usersPage).toContain('caps.has("users.delete")');
    expect(usersPage).not.toContain('const isAdmin = caps.has("users.edit")');

    expect(userActions).toContain("actorCanDelete");
    expect(userActions).not.toContain('actorRole === "admin"');

    expect(editDialog).toContain("canEditRole");
    expect(editDialog).toContain("roleOptions");
    expect(editDialog).not.toContain('actorRole === "instructor"');
  });
});
