import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("submission detail time-limit wiring", () => {
  it("threads problem time limits from server pages into the submission detail client badges", () => {
    const dashboardPage = read("src/app/(dashboard)/dashboard/submissions/[id]/page.tsx");
    const publicPage = read("src/app/(public)/submissions/[id]/page.tsx");
    const client = read("src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx");

    expect(dashboardPage).toContain("timeLimitMs: true");
    expect(dashboardPage).toContain("problemTimeLimitMs={submission.problem?.timeLimitMs ?? null}");
    expect(publicPage).toContain("timeLimitMs: true");
    expect(publicPage).toContain("problemTimeLimitMs={submission.problem?.timeLimitMs ?? null}");
    expect(client).toContain("problemTimeLimitMs?: number | null");
    expect(client).toContain("timeLimitMs={props.problemTimeLimitMs ?? null}");
  });
});
