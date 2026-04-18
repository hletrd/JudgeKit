import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin submissions bulk rejudge implementation", () => {
  it("requires submissions.rejudge and rejects bulk requests outside the caller's submission-review scope", () => {
    const source = read("src/app/api/v1/admin/submissions/rejudge/route.ts");

    expect(source).toContain('capabilities: ["submissions.rejudge"]');
    expect(source).toContain("getSubmissionReviewGroupIds(user.id, user.role)");
    expect(source).toContain("const permittedSubmissionRows = await db");
    expect(source).toContain("if (permittedSubmissionRows.length !== uniqueSubmissionIds.length)");
    expect(source).toContain("return forbidden();");
    expect(source).toContain('rateLimit: "submissions.bulk-rejudge"');
    expect(source).toContain("submissionResults");
    expect(source).toContain('status: "pending"');
    expect(source).toContain("judgeClaimToken: null");
    expect(source).toContain("submission.bulk_rejudged");
  });
});
