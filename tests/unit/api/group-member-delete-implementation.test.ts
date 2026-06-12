import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("group member delete implementation guards", () => {
  it("locks the enrollment row inside the final transaction before removal", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/members/[userId]/route.ts"),
      "utf8"
    );

    expect(source).toContain(".from(enrollments)");
    expect(source).toContain('.for("update")');
    expect(source).toContain('return { error: "studentEnrollmentNotFound" as const };');
    expect(source).toContain("return { member, revokedTokens };");
  });

  // RPF cycle-6 AGG6-1: roster removal must REVOKE contest access tokens
  // INSIDE the same transaction as the enrollment delete — a token surviving
  // the removal silently re-grants submit + contest detail. The revocation
  // count must reach the audit record.
  it("revokes the user's contest access tokens inside the removal transaction and audits the count", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/members/[userId]/route.ts"),
      "utf8"
    );

    expect(source).toContain("revokeContestAccessTokensForGroup(tx, id, userId)");
    expect(source).toContain("revokedAccessTokens: revokedTokens");
    // The revocation call must come after the enrollment delete in the tx body.
    const deleteIdx = source.indexOf("tx.delete(enrollments)");
    const revokeIdx = source.indexOf("revokeContestAccessTokensForGroup(tx");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(deleteIdx);
  });
});
