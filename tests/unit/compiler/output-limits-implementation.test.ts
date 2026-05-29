import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("compiler output truncation limits", () => {
  it("keeps the Node compiler runner and Rust worker aligned at a 128 MiB default", () => {
    const tsSource = read("src/lib/compiler/execute.ts");
    const rustSource = read("judge-worker-rs/src/docker.rs");

    expect(tsSource).toContain("const MAX_OUTPUT_BYTES = 134_217_728; // 128 MiB");
    // Rust worker: the per-stream cap is env-configurable (JUDGE_MAX_OUTPUT_BYTES)
    // but DEFAULTS to 128 MiB, staying aligned with the Node runner above.
    expect(rustSource).toContain("JUDGE_MAX_OUTPUT_BYTES");
    expect(rustSource).toContain(".unwrap_or(134_217_728); // 128 MiB");
  });

  it("drains past the cap instead of tearing down the pipe (no spurious EPIPE)", () => {
    // The original implementation called `stdout.destroy()` (Node) or
    // dropped the `Take` adapter (Rust) once the cap was reached. Both
    // closed the pipe and forced the child process to die on its next
    // write with `write /dev/stdout: broken pipe` — masking the real
    // "output exceeded the limit" signal. Verify the new behavior is
    // structurally present so the regression can't sneak back in.
    const tsSource = read("src/lib/compiler/execute.ts");
    const rustSource = read("judge-worker-rs/src/docker.rs");

    expect(tsSource).not.toContain("child.stdout?.destroy()");
    expect(tsSource).not.toContain("child.stderr?.destroy()");
    expect(rustSource).toContain("tokio::io::copy(&mut inner, &mut tokio::io::sink())");
  });
});
