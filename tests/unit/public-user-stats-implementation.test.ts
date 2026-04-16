import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public user stats implementation", () => {
  it("builds difficulty/category/language/activity sections on the public user page", () => {
    const source = read("src/app/(public)/users/[id]/page.tsx");

    expect(source).toContain("UserStatsDashboard");
    expect(source).toContain("solvedProblemMetaRows");
    expect(source).toContain("languageUsageRows");
    expect(source).toContain("activityRows");
  });
});
