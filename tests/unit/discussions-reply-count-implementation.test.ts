import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("discussion thread lists use a batched reply count", () => {
  it("counts replies via a single count(*) aggregate, not by eager-loading every post row", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/discussions/data.ts"), "utf8");
    // batched helper + the count aggregate, mirroring listVoteSummaries
    expect(source).toContain("async function listReplyCounts");
    expect(source).toContain("count(*)");
    expect(source).toContain(".groupBy(discussionPosts.threadId)");
    // the community/problem list functions attach replyCount instead of eager posts
    expect(source).toContain("withReplyCounts(withThreadVotes");
  });
});
