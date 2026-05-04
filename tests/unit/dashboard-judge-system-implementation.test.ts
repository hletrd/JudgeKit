import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("dashboard judge system implementation", () => {
  it("wires the judge system section into the root dashboard page", () => {
    const source = read("src/app/(public)/dashboard/page.tsx");

    expect(source).toContain('DashboardJudgeSystemSection');
    expect(source).toContain('!isAdminView && !isCandidateView && (');
  });

  it("consolidates the languages page into the public route with auth-aware rendering", () => {
    const source = read("src/app/(public)/languages/page.tsx");

    expect(source).toContain("getJudgeSystemSnapshot()");
    expect(source).toContain("auth()");
    expect(source).toContain("resolveCapabilities");
    // Auth-aware: worker count visible to admins only
    expect(source).toContain("showWorkerCount");
    expect(source).toContain("onlineWorkerCount");
  });

  it("redirects legacy dashboard routes to public counterparts", () => {
    const source = read("next.config.ts");

    expect(source).toContain("source: \"/dashboard/rankings\"");
    expect(source).toContain("destination: \"/rankings\"");
    expect(source).toContain("source: \"/dashboard/languages\"");
    expect(source).toContain("destination: \"/languages\"");
    expect(source).toContain("source: \"/dashboard/compiler\"");
    expect(source).toContain("destination: \"/playground\"");
  });
});
