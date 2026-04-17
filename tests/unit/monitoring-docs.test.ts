import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("monitoring documentation", () => {
  it("documents the shipped health, metrics, and monitor script surfaces", () => {
    const readme = read("README.md");
    const checklist = read("docs/release-readiness-checklist.md");
    const doc = read("docs/monitoring.md");

    expect(readme).toContain("docs/monitoring.md");
    expect(checklist).toContain("docs/monitoring.md");
    expect(doc).toContain("GET /api/health");
    expect(doc).toContain("GET /api/metrics");
    expect(doc).toContain("scripts/monitor-health.sh");
    expect(doc).toContain("submission queue depth");
    expect(doc).toContain("stale worker count");
  });
});
