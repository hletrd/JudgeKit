import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("buildDockerImage implementation", () => {
  it("uses the repository root as the docker build context", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/docker/client.ts"), "utf8");

    expect(source).toContain('const contextDir = ".";');
    expect(source).toContain('spawn("docker", ["build", "-t", imageName, "-f", dockerfilePath, contextDir])');
  });
});
