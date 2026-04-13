import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("compiler output truncation limits", () => {
  it("keeps the Node compiler runner and Rust worker aligned at 4 MiB", () => {
    const tsSource = read("src/lib/compiler/execute.ts");
    const rustSource = read("judge-worker-rs/src/docker.rs");

    expect(tsSource).toContain("const MAX_OUTPUT_BYTES = 4_194_304; // 4 MiB");
    expect(rustSource).toContain("const MAX_OUTPUT_BYTES: u64 = 4_194_304; // 4 MiB");
  });
});
