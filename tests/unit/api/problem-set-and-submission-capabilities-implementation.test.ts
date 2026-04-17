import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeExpectations: Array<{ file: string; snippets: string[] }> = [
  {
    file: "src/app/api/v1/problem-sets/route.ts",
    snippets: [
      'auth: { capabilities: ["problem_sets.create"] }',
      "requireAllCapabilities: false",
    ],
  },
  {
    file: "src/app/api/v1/problem-sets/[id]/route.ts",
    snippets: [
      'auth: { capabilities: ["problem_sets.edit"] }',
      'auth: { capabilities: ["problem_sets.delete"] }',
      "requireAllCapabilities: false",
    ],
  },
  {
    file: "src/app/api/v1/problem-sets/[id]/groups/route.ts",
    snippets: ['auth: { capabilities: ["problem_sets.assign_groups"] }'],
  },
  {
    file: "src/app/api/v1/submissions/[id]/comments/route.ts",
    snippets: ['auth: { capabilities: ["submissions.comment"] }'],
  },
  {
    file: "src/app/api/v1/submissions/[id]/rejudge/route.ts",
    snippets: ['auth: { capabilities: ["submissions.rejudge"] }'],
  },
];

describe("problem-set and submission moderation routes use capability auth", () => {
  it("guards the routes with the matching capabilities instead of built-in role checks", () => {
    for (const { file, snippets } of routeExpectations) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      for (const snippet of snippets) {
        expect(source).toContain(snippet);
      }
      expect(source).not.toContain("isAdmin(user.role)");
      expect(source).not.toContain('user.role !== "instructor"');
      expect(source).not.toContain('user.role === "instructor"');
      expect(source).not.toContain("isInstructor(user.role)");
    }
  });
});
