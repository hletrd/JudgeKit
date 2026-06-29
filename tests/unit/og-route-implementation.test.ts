import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("OG route implementation", () => {
  it("keeps the OG route on node runtime with cacheable png output", () => {
    const source = read("src/app/og/route.tsx");

    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain('export const revalidate = 86400');
    expect(source).toContain('import { ImageResponse } from "next/og"');
    expect(source).toContain("const imageSize = {");
    expect(source).toContain("width: 1200");
    expect(source).toContain("height: 630");
    expect(source).toContain("new ImageResponse(");
  });

  it("keeps the polished OG card styling cues in place", () => {
    const source = read("src/app/og/route.tsx");

    expect(source).toContain("linear-gradient(135deg, #0b1220 0%, #1d4ed8 52%, #7c3aed 100%)");
    expect(source).toContain("borderTop: \"1px solid rgba(255,255,255,0.14)\"");
    expect(source).toContain("badge ? (");
    expect(source).toContain("footer");
  });
});
