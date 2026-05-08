import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROXY_PATH = "src/proxy.ts";

describe("proxy error handling", () => {
  it("wraps the proxy handler in a try/catch block", () => {
    const source = readFileSync(join(process.cwd(), PROXY_PATH), "utf8");
    // Must have a try/catch wrapping the proxy logic
    expect(source).toContain("try {");
    expect(source).toContain("catch (error)");
  });

  it("logs errors via logger in the catch block", () => {
    const source = readFileSync(join(process.cwd(), PROXY_PATH), "utf8");
    expect(source).toContain('logger.error({ err: error');
  });

  it("returns a 500 response for API routes on error", () => {
    const source = readFileSync(join(process.cwd(), PROXY_PATH), "utf8");
    // Must return JSON error response
    expect(source).toContain('NextResponse.json({ error: "internalServerError" }, { status: 500 })');
  });

  it("has an internal _proxy helper function", () => {
    const source = readFileSync(join(process.cwd(), PROXY_PATH), "utf8");
    expect(source).toContain("async function _proxy(request: NextRequest)");
  });
});
