import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("tag resolution implementation guards", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/problem-management.ts"), "utf8");

  it("creates tags race-safely with ON CONFLICT DO NOTHING instead of catching 23505", () => {
    // A 23505 catch inside a PG transaction is dead code: the tx is aborted
    // (25P02) after the violation, so any recovery query fails too
    // (RPF cycle-1 PR-M1).
    expect(source).toContain(".onConflictDoNothing({ target: tags.name })");
    expect(source).not.toContain('pgErr.code !== "23505"');
    // The conflict path must re-select the winner's row.
    expect(source).toContain("conflicted on insert but is not selectable");
  });

  it("dedupes tag names after trimming and tag ids before insert", () => {
    // ["dp", " dp"] must not produce a duplicate problem_tags insert that
    // aborts the mutation on pt_problem_tag_idx (RPF cycle-1 PR-M2).
    expect(source).toContain("seenNames.has(trimmed)");
    expect(source).toContain("new Set(tagIds)");
  });
});
