import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("participant timeline route implementation", () => {
  it("re-exports the participant audit page at the dedicated /timeline route", () => {
    const source = read(
      "src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/timeline/page.tsx"
    );

    expect(source).toContain('export { default } from "../page";');
  });
});
