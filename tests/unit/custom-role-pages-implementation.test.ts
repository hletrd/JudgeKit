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
      "src/app/(public)/contests/manage/page.tsx",
      "src/app/(public)/contests/manage/[assignmentId]/analytics/page.tsx",
      "src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/page.tsx",
      "src/app/(public)/contests/manage/[assignmentId]/page.tsx",
      "src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx",
      "src/app/(public)/groups/[id]/assignments/[assignmentId]/page.tsx",
      "src/app/(public)/groups/[id]/page.tsx",
      "src/app/(public)/problem-sets/page.tsx",
      "src/app/(public)/problem-sets/new/page.tsx",
      "src/app/(public)/problem-sets/[id]/page.tsx",
      "src/app/(public)/problems/page.tsx",
      "src/app/(public)/problems/[id]/page.tsx",
      "src/app/(public)/problems/[id]/edit/page.tsx",
    ];

    for (const pagePath of pagePaths) {
      expect(read(pagePath)).not.toContain("assertUserRole(");
    }
  });

  it("keeps contest discovery capability-aware for custom roles", () => {
    const contestsHelper = read("src/lib/assignments/contests.ts");
    const managementHelper = read("src/lib/assignments/management.ts");

    expect(contestsHelper).toContain("resolveCapabilities");
    expect(contestsHelper).toContain("group_instructors gi");
    expect(contestsHelper).toContain("groups.view_all");
    expect(contestsHelper).not.toContain('role === "admin"');
    expect(contestsHelper).not.toContain('role === "super_admin"');
    expect(contestsHelper).not.toContain('role === "instructor"');

    expect(managementHelper).toContain("caps.has(\"groups.view_all\")");
    expect(managementHelper).not.toContain('role === "super_admin"');
    expect(managementHelper).not.toContain('role === "admin"');
    expect(managementHelper).not.toContain('role === "instructor"');
  });

  it("keeps problem and dashboard affordances capability-aware for custom roles", () => {
    const dashboardLayout = read("src/app/(dashboard)/layout.tsx");
    const problemSetsPage = read("src/app/(public)/problem-sets/page.tsx");
    const newProblemSetPage = read("src/app/(public)/problem-sets/new/page.tsx");
    const problemSetDetailPage = read("src/app/(public)/problem-sets/[id]/page.tsx");
    const problemsPage = read("src/app/(public)/problems/page.tsx");
    // The dashboard problem detail page was migrated to a redirect-only shell
    // (workspace→public migration); the capability-aware page now lives at
    // (public)/practice/problems/[id]/page.tsx. Verify the shell is just a
    // redirect and assert the capability checks on the public counterpart.
    const dashboardProblemRedirect = read("src/app/(public)/problems/[id]/page.tsx");
    const publicPracticeDetail = read("src/app/(public)/practice/problems/[id]/page.tsx");
    const appSidebar = read("src/components/layout/app-sidebar.tsx");

    expect(dashboardLayout).toContain('capsSet.has("assignments.view_status")');
    expect(dashboardLayout).not.toContain('session.user.role === "admin"');

    expect(problemSetsPage).toContain("getProblemSetCapabilityFlags");
    expect(problemSetsPage).not.toContain("isInstructorOrAbove");

    expect(newProblemSetPage).toContain("getProblemSetCapabilityFlags");
    expect(newProblemSetPage).not.toContain("isInstructorOrAbove");

    expect(problemSetDetailPage).toContain("getProblemSetCapabilityFlags");
    expect(problemSetDetailPage).toContain("canManageProblemSetForUser");
    expect(problemSetDetailPage).not.toContain("isInstructorOrAbove");

    expect(appSidebar).not.toContain('capability: "problem_sets.view"');
    // Non-admin nav items (Problems, Groups, Problem Sets) have been moved
    // to the PublicHeader dropdown. Verify the dropdown keeps them capability-aware.
    const publicNav = read("src/lib/navigation/public-nav.ts");
    expect(publicNav).toContain('capability: "problem_sets.create"');
    expect(publicNav).toContain('label: "problems"');

    expect(problemsPage).toContain("resolveCapabilities");
    expect(problemsPage).toContain('caps.has("problems.edit")');
    expect(problemsPage).toContain('caps.has("problems.view_all")');
    expect(problemsPage).not.toContain('session.user.role === "admin"');

    // The dashboard route is now a redirect shell — the capability checks
    // live in the public counterpart. Make this explicit so a future
    // contributor doesn't reintroduce duplicate checks here.
    expect(dashboardProblemRedirect).toContain("redirect(");
    expect(dashboardProblemRedirect).toContain("/practice/problems/");
    expect(dashboardProblemRedirect).not.toContain("resolveCapabilities");

    expect(publicPracticeDetail).toContain("resolveCapabilities");
    expect(publicPracticeDetail).toContain('caps.has("problems.edit")');
    expect(publicPracticeDetail).not.toContain('session.user.role === "admin"');
  });

  it("keeps admin user-management affordances capability-aware for custom roles", () => {
    const usersPage = read("src/app/(dashboard)/dashboard/admin/users/page.tsx");
    const addDialog = read("src/app/(dashboard)/dashboard/admin/users/add-user-dialog.tsx");
    const userActions = read("src/app/(dashboard)/dashboard/admin/users/user-actions.tsx");
    const editDialog = read("src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx");
    const userDetailPage = read("src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx");
    const profilePage = read("src/app/(public)/profile/page.tsx");

    expect(usersPage).toContain("canManageRoleAsync");
    expect(usersPage).toContain('caps.has("users.create")');
    expect(usersPage).toContain('caps.has("users.edit")');
    expect(usersPage).toContain('caps.has("users.delete")');
    expect(usersPage).not.toContain('const isAdmin = caps.has("users.edit")');
    expect(usersPage).not.toContain('filters.push(eq(users.role, "student"))');
    expect(usersPage).toContain("{canEditUsers ? (");

    expect(userActions).toContain("actorCanEdit");
    expect(userActions).toContain("actorCanDelete");
    expect(userActions).not.toContain('actorRole === "admin"');
    expect(userActions).toContain("{actorCanEdit ? (");

    expect(addDialog).toContain("availableRoles");
    expect(addDialog).toContain('assistant: t("roleOptions.assistant")');
    expect(addDialog).toContain('super_admin: t("roleOptions.super_admin")');
    expect(addDialog).not.toContain("actorRole");
    expect(addDialog).not.toContain('.filter((r) => r.name !== "super_admin")');

    expect(editDialog).toContain("canEditRole");
    expect(editDialog).toContain("roleOptions");
    expect(editDialog).toContain('assistant: t("roleOptions.assistant")');
    expect(editDialog).not.toContain("actorRole");
    expect(editDialog).not.toContain('actorRole === "instructor"');
    expect(editDialog).not.toContain('.filter((r) => r.name !== "super_admin" || user.role === "super_admin")');

    expect(userDetailPage).toContain('if (!caps.has("users.view")) redirect("/dashboard");');
    expect(userDetailPage).toContain('const canEditUsers = caps.has("users.edit");');
    expect(userDetailPage).toContain("actorCanEdit={canEditUsers}");
    expect(userDetailPage).toContain('assistant: tCommon("roles.assistant")');
    expect(userDetailPage).toContain("db.query.roles.findFirst");
    expect(userDetailPage).toContain("roleRecord?.displayName");

    expect(profilePage).toContain('assistant: tCommon("roles.assistant")');
    expect(profilePage).toContain("getRoleLevel");
    expect(profilePage).toContain("roleRecord?.displayName");
    expect(profilePage).toContain("const canEditClassName = actorRoleLevel > 0;");
  });
});
