import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("public problem-set search implementation", () => {
  it("threads the public problem-set search and tag filters through the helper and page pagination", () => {
    const helperSource = read("src/lib/problem-sets/public.ts");
    const pageSource = read("src/app/(public)/practice/sets/page.tsx");

    expect(helperSource).toContain("buildPublicProblemSetSearchFilter");
    expect(helperSource).toContain("normalizePracticeSearch");
    expect(helperSource).toContain("problemSets.name");
    expect(helperSource).toContain("problemSets.description");
    expect(helperSource).toContain("ESCAPE");
    expect(helperSource).toContain("problemSetProblems");
    expect(helperSource).toContain("tags.name");
    expect(pageSource).toContain("searchParams?: Promise<{ page?: string; search?: string; tag?: string }>");
    expect(pageSource).toContain('name="search"');
    expect(pageSource).toContain('name="tag"');
    expect(pageSource).toContain("countPublicProblemSets(searchQuery, currentTag)");
    expect(pageSource).toContain("listPublicProblemSets({ limit: PAGE_SIZE, offset, search: searchQuery, tag: currentTag })");
    expect(pageSource).toContain("listPublicProblemSetTags()");
  });
});
