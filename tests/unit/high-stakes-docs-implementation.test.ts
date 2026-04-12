import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("high-stakes documentation implementation", () => {
  it("documents the current exam integrity evidence model", () => {
    const readme = read("README.md");
    const integrityDoc = read("docs/exam-integrity-model.md");

    expect(readme).toContain("docs/exam-integrity-model.md");
    expect(integrityDoc).toContain("integrity telemetry");
    expect(integrityDoc).toContain("not proof of misconduct");
  });

  it("documents a dedicated judge-worker incident runbook and links it from operator docs", () => {
    const readme = read("README.md");
    const opsGuide = read("docs/high-stakes-operations.md");
    const runbook = read("docs/judge-worker-incident-runbook.md");

    expect(readme).toContain("docs/judge-worker-incident-runbook.md");
    expect(opsGuide).toContain("docs/judge-worker-incident-runbook.md");
    expect(runbook).toContain("privileged trust boundary");
    expect(runbook).toContain("Immediate containment");
  });

  it("shows the explicit evidence model guidance in the anti-cheat dashboard", () => {
    const source = read("src/components/contest/anti-cheat-dashboard.tsx");

    expect(source).toContain('t("reviewModelTelemetry")');
    expect(source).toContain('t("reviewModelCorroboration")');
    expect(source).toContain('t("reviewModelSeriousActions")');
  });
});
