import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("recruiting invitation race guards", () => {
  it("uses advisory locks plus transactional duplicate checks for invitation emails", () => {
    const singleRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts"),
      "utf8"
    );
    const bulkRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts"),
      "utf8"
    );

    expect(singleRoute).toContain("pg_advisory_xact_lock");
    expect(singleRoute).toContain('throw new Error("emailAlreadyInvited")');
    expect(singleRoute).toContain("createRecruitingInvitation({");

    expect(bulkRoute).toContain("pg_advisory_xact_lock");
    expect(bulkRoute).toContain("const orderedEmails = [...uniqueEmails].sort()");
    expect(bulkRoute).toContain('throw new Error("emailAlreadyInvited")');
    expect(bulkRoute).toContain("bulkCreateRecruitingInvitations({");
  });
});
