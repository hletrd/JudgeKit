import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("lecture stats wiring implementation", () => {
  it("wires lecture stats through lecture-mode context instead of leaving them unreachable", () => {
    const provider = read("src/components/lecture/lecture-mode-provider.tsx");
    const toolbar = read("src/components/lecture/lecture-toolbar.tsx");
    const wrapper = read("src/app/(public)/problems/[id]/problem-lecture-wrapper.tsx");

    expect(provider).toContain("statsAvailable: boolean");
    expect(provider).toContain("showStats: boolean");
    expect(provider).toContain("toggleStats: () => void");
    expect(provider).toContain("closeStats: () => void");

    expect(toolbar).toContain("const {");
    expect(toolbar).toContain("statsAvailable,");
    expect(toolbar).toContain("toggleStats,");
    expect(toolbar).toContain("{statsAvailable && (");

    expect(wrapper).toContain("setStatsAvailable(true);");
    expect(wrapper).toContain("setStatsAvailable(false);");
    expect(wrapper).toContain("open={showStats}");
    expect(wrapper).toContain("onClose={closeStats}");
  });

  it("scopes lecture submission stats by assignment and requests aggregated summary data", () => {
    const overview = read("src/components/lecture/submission-overview.tsx");
    const submissionsRoute = read("src/app/api/v1/submissions/route.ts");
    // Workspace→public migration: the lecture-stats wiring on the problem
    // page moved with the page from (dashboard)/problems/[id] to
    // (public)/practice/problems/[id]. The assignmentId={...} prop binding
    // is preserved at the new location.
    const problemPage = read("src/app/(public)/practice/problems/[id]/page.tsx");

    expect(problemPage).toContain("assignmentId={assignmentContext?.id ?? null}");
    expect(overview).toContain("if (assignmentId) {");
    expect(overview).toContain('params.set("assignmentId", assignmentId);');
    expect(overview).toContain('includeSummary: "1"');
    expect(overview).toContain('import { apiFetch } from "@/lib/api/client"');
    expect(overview).not.toContain("await fetch(`/api/v1/submissions?");
    expect(submissionsRoute).toContain('const includeSummary = searchParams.get("includeSummary") === "1";');
    expect(submissionsRoute).toContain("const assignmentFilter = assignmentId ? eq(submissions.assignmentId, assignmentId) : undefined;");
    expect(submissionsRoute).toContain("groupBy(submissions.status)");
  });
});
