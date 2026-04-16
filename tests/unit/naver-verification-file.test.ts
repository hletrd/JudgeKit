import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILE_NAME = "naver15a647af213e2159ed095a2819fa5a79.html";
const EXPECTED_CONTENT = "naver-site-verification: naver15a647af213e2159ed095a2819fa5a79.html";

describe("naver verification file", () => {
  it("is published from the Next.js public root with the expected content", () => {
    const content = readFileSync(join(process.cwd(), "public", FILE_NAME), "utf8").trim();

    expect(content).toBe(EXPECTED_CONTENT);
  });
});
