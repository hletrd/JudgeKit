import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("import route deprecated JSON body path headers", () => {
  const source = read("src/app/api/v1/admin/migrate/import/route.ts");

  it("returns Deprecation header on JSON body path error response", () => {
    expect(source).toContain('"Deprecation": "true"');
  });

  it("returns Sunset header on JSON body path error response", () => {
    expect(source).toContain('"Sunset":');
  });

  it("returns Deprecation header on JSON body path success response", () => {
    // Both error and success paths should include deprecation headers
    const deprecationMatches = source.match(/"Deprecation": "true"/g);
    expect(deprecationMatches?.length).toBeGreaterThanOrEqual(2);
  });

  it("returns Sunset header on JSON body path success response", () => {
    const sunsetMatches = source.match(/"Sunset":/g);
    expect(sunsetMatches?.length).toBeGreaterThanOrEqual(2);
  });

  it("has a Sunset date in the future (after 2026-04-01)", () => {
    const sunsetMatch = source.match(/"Sunset": "([^"]+)"/);
    expect(sunsetMatch).toBeTruthy();
    const sunsetDate = new Date(sunsetMatch![1]);
    expect(sunsetDate.getTime()).toBeGreaterThan(new Date("2026-04-01").getTime());
  });
});
