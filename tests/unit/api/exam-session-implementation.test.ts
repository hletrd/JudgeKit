import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("exam session route capability guards", () => {
  it("uses shared group-management checks instead of built-in admin-only logic", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts"),
      "utf8"
    );

    expect(source).toContain("canManageGroupResourcesAsync(");
    // The ?userId override must be gated on group-staff (canViewAssignmentSubmissions),
    // NOT a bare global contests.view_analytics capability, which leaked a
    // co-participant's exam timing to any enrolled analytics-holder.
    expect(source).toContain("canViewAssignmentSubmissions(assignmentId, user.id, user.role)");
    expect(source).not.toContain('caps.has("contests.view_analytics")');
    expect(source).not.toContain("isAdmin(user.role)");
  });
});
