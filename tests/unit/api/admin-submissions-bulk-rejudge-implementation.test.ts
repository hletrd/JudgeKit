import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("admin submissions bulk rejudge implementation", () => {
  it("uses submissions.view_all + submissions.rejudge auth and resets results in bulk", () => {
    const source = read("src/app/api/v1/admin/submissions/rejudge/route.ts");

    expect(source).toContain('capabilities: ["submissions.view_all", "submissions.rejudge"]');
    expect(source).toContain('rateLimit: "submissions.bulk-rejudge"');
    expect(source).toContain("submissionResults");
    expect(source).toContain('status: "pending"');
    expect(source).toContain("judgeClaimToken: null");
    expect(source).toContain("submission.bulk_rejudged");
  });
});
