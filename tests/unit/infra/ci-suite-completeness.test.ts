import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("CI suite completeness", () => {
  const ci = read(".github/workflows/ci.yml");

  it("runs unit tests with coverage (not bare test:unit)", () => {
    expect(ci).toContain("npm run test:unit:coverage");
    expect(ci).not.toMatch(/npm run test:unit(?!:)/);
  });

  it("runs component tests", () => {
    expect(ci).toContain("npm run test:component");
  });

  it("runs integration tests", () => {
    expect(ci).toContain("npm run test:integration");
  });

  it("runs dependency vulnerability scans for Node and Rust", () => {
    expect(ci).toContain("npm audit --audit-level=high");
    expect(ci).toContain("cargo install cargo-audit --locked");
    expect(ci).toContain("cargo audit");
  });

  it("all three test steps belong to the quality job", () => {
    // The quality job block runs from the `quality:` key to the next top-level job key.
    // Top-level job keys in GitHub Actions YAML are indented with exactly 2 spaces.
    // Split the whole file on those boundaries and find the quality section.
    const parts = ci.split(/(?=^  \w[\w-]*:\s*$)/m);
    const qualityBlock = parts.find((p) => p.trimStart().startsWith("quality:"));
    expect(qualityBlock, "quality job not found in ci.yml").toBeTruthy();

    expect(qualityBlock).toContain("npm run test:unit:coverage");
    expect(qualityBlock).toContain("npm run test:component");
    expect(qualityBlock).toContain("npm run test:integration");
    expect(qualityBlock).toContain("npm audit --audit-level=high");
    expect(qualityBlock).toContain("cargo audit");
  });

  it("keeps a metrics route under test coverage expectations", () => {
    const apiRef = read("docs/api.md");
    expect(apiRef).toContain("#### `GET /api/metrics`");
  });
});
