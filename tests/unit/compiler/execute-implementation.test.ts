import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("compiler execute implementation", () => {
  it("keeps local fallback workspaces writable for the non-root sandbox user", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/compiler/execute.ts"), "utf8");

    expect(source).toContain('"65534:65534"');
    expect(source).toContain("await chmod(workspaceDir, 0o777);");
    expect(source).toContain("await chmod(join(workspaceDir, sourceFileName), 0o644);");
  });

  it("keeps the legacy deploy path compatible with compiler workspace creation", () => {
    const source = readFileSync(join(process.cwd(), "deploy.sh"), "utf8");

    expect(source).toContain("sudo chmod 1777 /compiler-workspaces");
  });
});
