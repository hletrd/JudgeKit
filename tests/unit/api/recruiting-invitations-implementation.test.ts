import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeFiles = [
  "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts",
  "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts",
  "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts",
  "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts",
];

describe("recruiting invitation route capability guards", () => {
  it("uses recruiting.manage_invitations capability checks instead of admin-only role checks", () => {
    for (const file of routeFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain('auth: { capabilities: ["recruiting.manage_invitations"] }');
      expect(source).not.toContain("isAdmin(user.role)");
    }
  });

  it("keeps password resets in self-service mode instead of returning fresh secrets to recruiters", () => {
    const detailRoute = readFileSync(
      join(
        process.cwd(),
        "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts"
      ),
      "utf8"
    );
    const helper = readFileSync(
      join(process.cwd(), "src/lib/assignments/recruiting-invitations.ts"),
      "utf8"
    );

    expect(detailRoute).toContain("passwordResetRequired: true");
    expect(detailRoute).not.toContain("temporaryPassword");
    expect(helper).toContain("accountPasswordResetRequired");
    expect(helper).not.toContain("Recruit-");
  });

  it("does not embed raw candidate name/email in the creation audit event (references the invitation id)", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts"),
      "utf8"
    );
    // Audit must reference the invitation (resourceId/label) rather than copying
    // candidate PII, which would survive in the audit log past account deletion.
    expect(source).not.toContain("resourceLabel: body.candidateName");
    // the old audit details embedded the raw email; it must not return
    expect(source).not.toContain("details: { assignmentId, candidateEmail");
    expect(source).toContain("resourceLabel: invitation.id");
    expect(source).toContain("details: { assignmentId }");
  });
});
