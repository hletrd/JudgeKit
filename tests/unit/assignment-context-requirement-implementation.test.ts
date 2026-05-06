import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("assignment-context requirement implementation", () => {
  it("uses a shared helper instead of hard-coding the built-in student role", () => {
    const helperSource = read("src/lib/assignments/submissions.ts");
    const permissionsSource = read("src/lib/auth/permissions.ts");
    // Workspace→public migration: the dashboard problem detail page is now
    // a redirect-only shell. The capability-aware logic moved to the public
    // counterpart at (public)/practice/problems/[id]/page.tsx, which builds
    // assignmentContext from query params and the recruiting-access scope
    // rather than the legacy getRequiredAssignmentContextsForProblem helper
    // (which is still used by the API routes that mutate state). Verify the
    // helper itself stays capability-driven and the API routes still call it.
    const submissionsRoute = read("src/app/api/v1/submissions/route.ts");
    const snapshotsRoute = read("src/app/api/v1/code-snapshots/route.ts");

    expect(helperSource).toContain("export async function getRequiredAssignmentContextsForProblem(");
    expect(helperSource).toContain('caps.has("submissions.view_all")');
    expect(helperSource).toContain('caps.has("assignments.view_status")');
    expect(helperSource).not.toContain('role === "instructor"');
    expect(permissionsSource).not.toContain('role === "super_admin" || role === "admin"');

    // API routes that mutate state still use the shared helper to enforce
    // the assignment-context requirement.
    expect(submissionsRoute).toContain("getRequiredAssignmentContextsForProblem(");
    expect(submissionsRoute).not.toContain('user.role === "student"');

    expect(snapshotsRoute).toContain("getRequiredAssignmentContextsForProblem(");
    expect(snapshotsRoute).not.toContain('user.role === "student"');
  });

  it("uses capabilities instead of built-in admin-only checks for navigation gating", () => {
    // Cycle 2: AppSidebar was deleted (dead code post-cycle-1 migration).
    // Navigation capability-gating now lives in:
    //   - src/lib/navigation/public-nav.ts (top nav + dropdown)
    //   - src/lib/navigation/admin-nav.ts (admin landing + quick shortcuts)
    // Verify both modules gate by capability strings rather than by
    // hard-coded role names.
    const publicNav = read("src/lib/navigation/public-nav.ts");
    const adminNav = read("src/lib/navigation/admin-nav.ts");

    expect(publicNav).toContain('"groups.view_all"');
    expect(publicNav).toContain('"problem_sets.view"');
    expect(publicNav).toContain('capability: "system.settings"');
    expect(publicNav).not.toContain('role === "admin"');
    expect(publicNav).not.toContain('role === "super_admin"');
    expect(publicNav).not.toContain('role === "instructor"');

    expect(adminNav).toContain('capability: "users.view"');
    expect(adminNav).toContain('capability: "system.settings"');
    expect(adminNav).toContain('capability: "users.manage_roles"');
    expect(adminNav).not.toContain('role === "admin"');
    expect(adminNav).not.toContain('role === "super_admin"');
    expect(adminNav).not.toContain('role === "instructor"');
  });

  it("routes AI and compiler context through the server-derived assignment helper", () => {
    const platformContextSource = read("src/lib/platform-mode-context.ts");
    const chatRouteSource = read("src/app/api/v1/plugins/chat-widget/chat/route.ts");
    const compilerRouteSource = read("src/app/api/v1/compiler/run/route.ts");

    expect(platformContextSource).toContain(
      "export async function resolvePlatformModeAssignmentContextDetails("
    );
    expect(chatRouteSource).toContain("resolvePlatformModeAssignmentContextDetails");
    expect(chatRouteSource).toContain('error: "assignmentContextMismatch"');
    expect(chatRouteSource).toContain("assignmentId: assignmentContext.assignmentId");

    expect(compilerRouteSource).toContain("resolvePlatformModeAssignmentContextDetails");
    expect(compilerRouteSource).toContain("assignmentId: assignmentContext.assignmentId");
  });
});
